import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  getMarketingBriefs, createMarketingBrief, updateMarketingBrief, deleteMarketingBrief,
  getMarketingNotifications, createMarketingNotification, markMarketingNotificationsRead, sendMarketingEmail,
  deleteMarketingNotification, deleteAllMarketingNotifications, getMarketingNotifyEmails, setMarketingNotifyEmail,
} from "../../services/api";
import type { MarketingNotifyEmails, MarketingNotifySlot } from "../../services/api";
import { useHubAccess } from "../../auth/HubAccessContext";
import { formatDateHuman } from "./theme";
import type { MarketingBrief, MarketingNotification, MarketingRole, MarketingUser, StageKey } from "./types";
import { STAGE_DEFS, stageLabel, addWorkDaysIso, todayIso, isPastDeadline } from "./types";

// Fallback recipients, used only until the marketing_notify_emails table has been seeded.
const DEFAULT_NOTIFY_EMAILS: MarketingNotifyEmails = {
  laura: "amazonassistant@formatucuerpo.com",
  diseno_1: "marketplaces@formatucuerpo.com",
  diseno_2: "",
  diseno_3: "",
};

function emailHtml(opts: { intro: string; reference: string; nextTask?: string; deadline?: string | null; note?: string }): string {
  const { intro, reference, nextTask, deadline, note } = opts;
  return `
    <div style="font-family: -apple-system, sans-serif; color: #2C2A20;">
      <p>${intro}</p>
      <p><strong>Referencia:</strong> ${reference}</p>
      ${nextTask ? `<p><strong>Próxima tarea:</strong> ${nextTask}</p>` : ""}
      ${deadline ? `<p><strong>Deadline:</strong> ${formatDateHuman(deadline)}, 5:00 PM hora de Colombia</p>` : ""}
      ${note ? `<p><strong>Nota:</strong> ${note}</p>` : ""}
      <p style="color:#6B6350;font-size:12px;">FTC Hub — Marketing</p>
    </div>
  `;
}

interface MarketingCtx {
  authedUser: MarketingUser | null;

  briefs: MarketingBrief[];
  notifications: MarketingNotification[];
  loading: boolean;
  reload: () => Promise<void>;

  createBrief: (reference: string, startDate: string, briefLink: string) => Promise<void>;
  submitDesignStage: (briefId: number, link: string, note?: string) => Promise<void>;
  lauraReview: (briefId: number, action: "approve" | "request_changes", opts?: { link?: string; note?: string }) => Promise<void>;
  requestExtraRevision: (briefId: number, note?: string) => Promise<void>;
  confirmPublish: (briefId: number, note?: string) => Promise<void>;
  updateStageLink: (briefId: number, stageKey: StageKey, link: string) => Promise<void>;
  claimBrief: (briefId: number, email: string) => Promise<void>;
  deleteBrief: (briefId: number) => Promise<void>;

  unreadCount: number;
  markNotificationRead: (id: number) => Promise<void>;
  deleteNotification: (id: number) => Promise<void>;
  clearAllNotifications: () => Promise<void>;

  notifyEmails: MarketingNotifyEmails;
  disenoEmailList: string[];
  updateNotifyEmail: (slot: MarketingNotifySlot, email: string) => Promise<void>;
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
  const [notifyEmails, setNotifyEmails] = useState<MarketingNotifyEmails>(DEFAULT_NOTIFY_EMAILS);
  const [loading, setLoading] = useState(true);

  const disenoEmailList = useMemo(
    () => [notifyEmails.diseno_1, notifyEmails.diseno_2, notifyEmails.diseno_3].map(e => e.trim()).filter(Boolean),
    [notifyEmails],
  );

  const reload = useCallback(async () => {
    const [b, n] = await Promise.all([getMarketingBriefs(), getMarketingNotifications()]);
    setBriefs(b); setNotifications(n);
  }, []);

  useEffect(() => {
    setLoading(true);
    reload().finally(() => setLoading(false));
    getMarketingNotifyEmails()
      .then(emails => setNotifyEmails(prev => ({
        laura: emails.laura || prev.laura,
        diseno_1: emails.diseno_1 || prev.diseno_1,
        diseno_2: emails.diseno_2 || prev.diseno_2,
        diseno_3: emails.diseno_3 || prev.diseno_3,
      })))
      .catch(() => {});
  }, [reload]);

  const updateNotifyEmail = async (slot: MarketingNotifySlot, email: string) => {
    await setMarketingNotifyEmail(slot, email);
    setNotifyEmails(prev => ({ ...prev, [slot]: email }));
  };

  // Diseño-directed emails go only to whoever claimed the brief, once someone has —
  // otherwise everyone gets it, so anyone free can pick it up.
  const disenoRecipients = (brief: MarketingBrief): string[] =>
    brief.assignedDisenoEmail ? [brief.assignedDisenoEmail] : disenoEmailList;

  const notify = async (briefId: number | null, message: string) => {
    await createMarketingNotification(briefId, message);
  };

  const createBrief = async (reference: string, startDate: string, briefLink: string) => {
    const stages = STAGE_DEFS.map((def, i) => {
      if (i === 0) {
        return { ...def, deadline: startDate, link: briefLink || null, completedAt: startDate, status: "done" as const };
      }
      if (i === 1) {
        return { ...def, deadline: addWorkDaysIso(startDate, def.gapDays), link: null, completedAt: null, status: "pending" as const };
      }
      return { ...def, deadline: null, link: null, completedAt: null, status: "pending" as const };
    });
    await createMarketingBrief({
      reference, startDate, currentStage: "proposal", status: "in_progress",
      stages, shiftDays: 0, lauraDelayDays: 0, designDelayCount: 0, extraRevisionRounds: 0,
      completedAt: null,
    });
    await notify(null, `Laura creó un nuevo brief: ${reference}.`);
    for (const email of disenoEmailList) {
      await sendMarketingEmail(
        email,
        `Nuevo brief — ${reference}`,
        emailHtml({
          intro: "Laura creó un nuevo brief. Entra a la plataforma y elige tu correo para tomarlo.",
          reference,
          nextTask: stageLabel("proposal"),
          deadline: addWorkDaysIso(startDate, STAGE_DEFS[1].gapDays),
        }),
      );
    }
    await reload();
  };

  const submitDesignStage = async (briefId: number, link: string, note?: string) => {
    const brief = briefs.find(b => b.id === briefId);
    if (!brief || brief.status === "completed") return;
    const stageIdx = brief.stages.findIndex(s => s.key === brief.currentStage);
    if (stageIdx === -1) return;
    const stage = brief.stages[stageIdx];
    const today = todayIso();
    const isLate = !!stage.deadline && isPastDeadline(stage.deadline);
    const nextStage = brief.stages[stageIdx + 1];
    const nextDeadline = nextStage ? addWorkDaysIso(today, nextStage.gapDays) : null;
    const newStages = brief.stages.map((s, i) => {
      if (i === stageIdx) return { ...s, link, completedAt: today, status: "done" as const, late: isLate };
      if (nextStage && i === stageIdx + 1) return { ...s, deadline: nextDeadline };
      return s;
    });
    await updateMarketingBrief(briefId, {
      stages: newStages,
      currentStage: nextStage ? nextStage.key : brief.currentStage,
      designDelayCount: brief.designDelayCount + (isLate ? 1 : 0),
    });
    const label = stage.key === "proposal" ? "la primera propuesta" : "los ajustes de diseño";
    await notify(briefId, `Diseño subió ${label} de ${brief.reference}.`);
    if (nextStage) {
      await sendMarketingEmail(
        notifyEmails.laura,
        `Tienes una revisión pendiente — ${brief.reference}`,
        emailHtml({
          intro: `Diseño subió ${label}. Te toca revisar.`,
          reference: brief.reference,
          nextTask: stageLabel(nextStage.key),
          deadline: nextDeadline,
          note,
        }),
      );
    }
    await reload();
  };

  const lauraReview = async (briefId: number, action: "approve" | "request_changes", opts?: { link?: string; note?: string }) => {
    const brief = briefs.find(b => b.id === briefId);
    if (!brief || brief.status === "completed") return;
    const stageIdx = brief.stages.findIndex(s => s.key === brief.currentStage);
    if (stageIdx === -1) return;
    const stage = brief.stages[stageIdx];
    const today = todayIso();

    if (action === "approve") {
      // Approving at any review stage skips straight to the publish step — Diseño still
      // has to confirm it went live, regardless of how early Laura approved.
      const publishStage = brief.stages.find(s => s.key === "publish")!;
      const publishDeadline = addWorkDaysIso(today, publishStage.gapDays);
      const newStages = brief.stages.map(s => {
        if (s.key === stage.key) return { ...s, completedAt: today, status: "done" as const, decision: "approved" as const };
        if (s.key === "publish") return { ...s, deadline: publishDeadline };
        return s;
      });
      await updateMarketingBrief(briefId, { stages: newStages, currentStage: "publish" });
      await notify(briefId, `Laura aprobó ${brief.reference} sin cambios — falta que Diseño confirme la publicación.`);
      for (const email of disenoRecipients(brief)) {
        await sendMarketingEmail(
          email,
          `Aprobado — confirma la publicación de ${brief.reference}`,
          emailHtml({
            intro: "Laura aprobó sin cambios. Falta que confirmes que ya se publicó.",
            reference: brief.reference,
            nextTask: stageLabel("publish"),
            deadline: publishDeadline,
            note: opts?.note,
          }),
        );
      }
      await reload();
      return;
    }

    // request_changes: mark this review stage done. The next stage's deadline is always
    // `today + gapDays`, counted from Laura's actual completion — so a fast or slow review
    // never shrinks or balloons Diseño's next deadline, and Laura's own timing is never
    // counted as a Diseño delay.
    const nextStage = brief.stages[stageIdx + 1];
    const nextDeadline = nextStage ? addWorkDaysIso(today, nextStage.gapDays) : null;
    const newStages = brief.stages.map((s, i) => {
      if (i === stageIdx) {
        return {
          ...s, completedAt: today, status: "done" as const, decision: "changes_requested" as const,
          link: opts?.link ? opts.link : s.link,
        };
      }
      if (nextStage && i === stageIdx + 1) return { ...s, deadline: nextDeadline };
      return s;
    });
    await updateMarketingBrief(briefId, {
      stages: newStages,
      currentStage: nextStage ? nextStage.key : brief.currentStage,
    });
    await notify(briefId, `Laura solicitó ajustes en ${brief.reference}.`);
    if (nextStage) {
      for (const email of disenoRecipients(brief)) {
        await sendMarketingEmail(
          email,
          `Ajustes solicitados — ${brief.reference}`,
          emailHtml({
            intro: "Laura solicitó ajustes en la última entrega.",
            reference: brief.reference,
            nextTask: stageLabel(nextStage.key),
            deadline: nextDeadline,
            note: opts?.note,
          }),
        );
      }
    }
    await reload();
  };

  const requestExtraRevision = async (briefId: number, note?: string) => {
    const brief = briefs.find(b => b.id === briefId);
    if (!brief || brief.status === "completed") return;
    const today = todayIso();
    const adjustments2Gap = brief.stages.find(s => s.key === "adjustments2")!.gapDays;
    const adjustments2Deadline = addWorkDaysIso(today, adjustments2Gap);
    const newStages = brief.stages.map(s => {
      if (s.key === "adjustments2") {
        return { ...s, status: "pending" as const, completedAt: null, link: null, decision: undefined, deadline: adjustments2Deadline };
      }
      if (s.key === "final") {
        return { ...s, status: "pending" as const, completedAt: null, decision: undefined, deadline: null };
      }
      return s;
    });
    await updateMarketingBrief(briefId, {
      stages: newStages, currentStage: "adjustments2",
      extraRevisionRounds: brief.extraRevisionRounds + 1,
    });
    await notify(briefId, `Laura solicitó una revisión adicional en ${brief.reference}.`);
    for (const email of disenoRecipients(brief)) {
      await sendMarketingEmail(
        email,
        `Revisión adicional solicitada — ${brief.reference}`,
        emailHtml({
          intro: "Laura solicitó una revisión adicional sobre el cierre final.",
          reference: brief.reference,
          nextTask: stageLabel("adjustments2"),
          deadline: adjustments2Deadline,
          note,
        }),
      );
    }
    await reload();
  };

  const confirmPublish = async (briefId: number, note?: string) => {
    const brief = briefs.find(b => b.id === briefId);
    if (!brief || brief.status === "completed" || brief.currentStage !== "publish") return;
    const today = todayIso();
    const newStages = brief.stages.map(s => s.key === "publish" ? { ...s, completedAt: today, status: "done" as const } : s);
    await updateMarketingBrief(briefId, {
      stages: newStages, currentStage: "completed", status: "completed", completedAt: today,
    });
    await notify(briefId, `Diseño confirmó la publicación de ${brief.reference} — brief completado.`);
    await sendMarketingEmail(
      notifyEmails.laura,
      `Publicado — ${brief.reference}`,
      emailHtml({ intro: "Diseño confirmó que ya se publicó. El brief quedó completado.", reference: brief.reference, note }),
    );
    await reload();
  };

  const updateStageLink = async (briefId: number, stageKey: StageKey, link: string) => {
    const brief = briefs.find(b => b.id === briefId);
    if (!brief) return;
    const newStages = brief.stages.map(s => s.key === stageKey ? { ...s, link } : s);
    await updateMarketingBrief(briefId, { stages: newStages });
    await reload();
  };

  const claimBrief = async (briefId: number, email: string) => {
    await updateMarketingBrief(briefId, { assignedDisenoEmail: email });
    await reload();
  };

  const deleteBrief = async (briefId: number) => {
    if (authedUser?.role !== "laura") throw new Error("Solo Laura puede eliminar briefs.");
    await deleteMarketingBrief(briefId);
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

  const deleteNotification = async (id: number) => {
    if (authedUser?.role !== "laura") throw new Error("Solo Laura puede eliminar notificaciones.");
    await deleteMarketingNotification(id);
    await reload();
  };

  const clearAllNotifications = async () => {
    if (authedUser?.role !== "laura") throw new Error("Solo Laura puede eliminar notificaciones.");
    await deleteAllMarketingNotifications();
    await reload();
  };

  return (
    <Ctx.Provider value={{
      authedUser, briefs, notifications, loading, reload,
      createBrief, submitDesignStage, lauraReview, requestExtraRevision, confirmPublish, updateStageLink, claimBrief, deleteBrief,
      unreadCount, markNotificationRead, deleteNotification, clearAllNotifications,
      notifyEmails, disenoEmailList, updateNotifyEmail,
    }}>
      {children}
    </Ctx.Provider>
  );
}

export type { MarketingRole };
