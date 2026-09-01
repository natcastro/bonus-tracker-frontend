import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  getMarketingBriefs, createMarketingBrief, updateMarketingBrief,
  getMarketingNotifications, createMarketingNotification, markMarketingNotificationsRead,
} from "../../services/api";
import { useHubAccess } from "../../auth/HubAccessContext";
import type { MarketingBrief, MarketingNotification, MarketingRole, MarketingUser, StageKey } from "./types";
import { STAGE_DEFS, addDaysIso, daysBetweenIso, todayIso } from "./types";

interface MarketingCtx {
  authedUser: MarketingUser | null;

  briefs: MarketingBrief[];
  notifications: MarketingNotification[];
  loading: boolean;
  reload: () => Promise<void>;

  createBrief: (reference: string, startDate: string, briefLink: string) => Promise<void>;
  submitDesignStage: (briefId: number, link: string) => Promise<void>;
  lauraReview: (briefId: number, action: "approve" | "request_changes") => Promise<void>;
  requestExtraRevision: (briefId: number) => Promise<void>;

  unreadCount: number;
  markNotificationRead: (id: number) => Promise<void>;
}

const Ctx = createContext<MarketingCtx | null>(null);

export function useMarketing() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useMarketing must be used within MarketingProvider");
  return ctx;
}

export function MarketingProvider({ children }: { children: ReactNode }) {
  const { getRole } = useHubAccess();
  const authedUser: MarketingUser | null = useMemo(() => {
    const role = getRole("MARKETING");
    if (role === "admin") return { role: "laura", name: "Laura" };
    if (role === "staff") return { role: "diseno", name: "Diseño" };
    return null;
  }, [getRole]);
  const [briefs, setBriefs] = useState<MarketingBrief[]>([]);
  const [notifications, setNotifications] = useState<MarketingNotification[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    const [b, n] = await Promise.all([getMarketingBriefs(), getMarketingNotifications()]);
    setBriefs(b); setNotifications(n);
  }, []);

  useEffect(() => {
    setLoading(true);
    reload().finally(() => setLoading(false));
  }, [reload]);

  const notify = async (briefId: number | null, message: string) => {
    await createMarketingNotification(briefId, message);
  };

  const createBrief = async (reference: string, startDate: string, briefLink: string) => {
    const stages = STAGE_DEFS.map(def => {
      const deadline = addDaysIso(startDate, def.plannedDay);
      if (def.key === "brief") {
        return { ...def, deadline, link: briefLink || null, completedAt: startDate, status: "done" as const };
      }
      return { ...def, deadline, link: null, completedAt: null, status: "pending" as const };
    });
    await createMarketingBrief({
      reference, startDate, currentStage: "proposal", status: "in_progress",
      stages, shiftDays: 0, lauraDelayDays: 0, designDelayCount: 0, extraRevisionRounds: 0,
      completedAt: null,
    });
    await notify(null, `Laura creó un nuevo brief: ${reference}.`);
    await reload();
  };

  const submitDesignStage = async (briefId: number, link: string) => {
    const brief = briefs.find(b => b.id === briefId);
    if (!brief || brief.status === "completed") return;
    const stageIdx = brief.stages.findIndex(s => s.key === brief.currentStage);
    if (stageIdx === -1) return;
    const stage = brief.stages[stageIdx];
    const today = todayIso();
    const isLate = today > stage.deadline;
    const newStages = brief.stages.map((s, i) => i === stageIdx ? { ...s, link, completedAt: today, status: "done" as const, late: isLate } : s);
    const nextStage = brief.stages[stageIdx + 1];
    await updateMarketingBrief(briefId, {
      stages: newStages,
      currentStage: nextStage ? nextStage.key : brief.currentStage,
      designDelayCount: brief.designDelayCount + (isLate ? 1 : 0),
    });
    const label = stage.key === "proposal" ? "la primera propuesta" : "los ajustes de diseño";
    await notify(briefId, `Diseño subió ${label} de ${brief.reference}.`);
    await reload();
  };

  const lauraReview = async (briefId: number, action: "approve" | "request_changes") => {
    const brief = briefs.find(b => b.id === briefId);
    if (!brief || brief.status === "completed") return;
    const stageIdx = brief.stages.findIndex(s => s.key === brief.currentStage);
    if (stageIdx === -1) return;
    const stage = brief.stages[stageIdx];
    const today = todayIso();

    if (action === "approve") {
      const newStages = brief.stages.map((s, i) => i === stageIdx ? { ...s, completedAt: today, status: "done" as const, decision: "approved" as const } : s);
      await updateMarketingBrief(briefId, {
        stages: newStages, currentStage: "completed", status: "completed", completedAt: today,
      });
      await notify(briefId, `Laura aprobó ${brief.reference} sin cambios — brief completado.`);
      await reload();
      return;
    }

    // request_changes: mark this review stage done, compute overrun vs the previous stage's
    // completion, and shift every still-pending stage's deadline forward by that overrun —
    // Design's later deadlines move, but this is never counted as a Design delay.
    const prevStage = brief.stages[stageIdx - 1];
    const allottedDays = prevStage ? stage.plannedDay - prevStage.plannedDay : 0;
    const actualDays = prevStage?.completedAt ? daysBetweenIso(prevStage.completedAt, today) : 0;
    const overrun = Math.max(0, actualDays - allottedDays);

    let newStages = brief.stages.map((s, i) => i === stageIdx ? { ...s, completedAt: today, status: "done" as const, decision: "changes_requested" as const } : s);
    if (overrun > 0) {
      newStages = newStages.map((s, i) => i > stageIdx && s.status === "pending" ? { ...s, deadline: addDaysIso(s.deadline, overrun) } : s);
    }
    const nextStage = brief.stages[stageIdx + 1];
    await updateMarketingBrief(briefId, {
      stages: newStages,
      currentStage: nextStage ? nextStage.key : brief.currentStage,
      shiftDays: brief.shiftDays + overrun,
      lauraDelayDays: brief.lauraDelayDays + overrun,
    });
    await notify(briefId, `Laura solicitó ajustes en ${brief.reference}.`);
    await reload();
  };

  const requestExtraRevision = async (briefId: number) => {
    const brief = briefs.find(b => b.id === briefId);
    if (!brief || brief.status === "completed") return;
    const today = todayIso();
    const newDeadlines: Record<StageKey, string> = {
      brief: "", proposal: "", review1: "",
      adjustments: addDaysIso(today, 2), review2: addDaysIso(today, 3), final: addDaysIso(today, 4),
    };
    const newStages = brief.stages.map(s => {
      if (s.key === "adjustments" || s.key === "review2" || s.key === "final") {
        return { ...s, status: "pending" as const, completedAt: null, link: s.key === "adjustments" ? null : s.link, decision: undefined, deadline: newDeadlines[s.key] };
      }
      return s;
    });
    await updateMarketingBrief(briefId, {
      stages: newStages, currentStage: "adjustments",
      extraRevisionRounds: brief.extraRevisionRounds + 1,
    });
    await notify(briefId, `Laura solicitó una revisión adicional en ${brief.reference}.`);
    await reload();
  };

  const unreadCount = useMemo(() => {
    if (!authedUser) return 0;
    const field = authedUser.role === "laura" ? "readLaura" : "readDiseno";
    return notifications.filter(n => !n[field]).length;
  }, [notifications, authedUser]);

  const markNotificationRead = async (id: number) => {
    if (!authedUser) return;
    const field = authedUser.role === "laura" ? "readLaura" : "readDiseno";
    const notif = notifications.find(n => n.id === id);
    if (!notif || notif[field]) return;
    await markMarketingNotificationsRead(authedUser.role, [id]);
    await reload();
  };

  return (
    <Ctx.Provider value={{
      authedUser, briefs, notifications, loading, reload,
      createBrief, submitDesignStage, lauraReview, requestExtraRevision,
      unreadCount, markNotificationRead,
    }}>
      {children}
    </Ctx.Provider>
  );
}

export type { MarketingRole };
