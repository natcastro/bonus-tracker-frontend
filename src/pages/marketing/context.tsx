import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  getMarketingBriefs, createMarketingBrief, updateMarketingBrief, deleteMarketingBrief,
  getMarketingNotifications, createMarketingNotification, markMarketingNotificationsRead, markTargetNotificationRead, sendMarketingEmail,
  deleteMarketingNotification, deleteAllMarketingNotifications, getMarketingNotifyEmails, setMarketingNotifyEmail, setMarketingNotifyCountry,
  getHubNicknames, getPrivateTasks, createPrivateTask as apiCreatePrivateTask,
  togglePrivateTaskCompleted as apiTogglePrivateTaskCompleted, deletePrivateTask as apiDeletePrivateTask,
  getTodoTasks, createTodoTask as apiCreateTodoTask, updateTodoTask, deleteTodoTask as apiDeleteTodoTask,
  getMarketingRequests, createMarketingRequest as apiCreateMarketingRequest, updateMarketingRequest, deleteMarketingRequest,
} from "../../services/api";
import type { MarketingNotifyEmails, MarketingNotifySlot, DisenoNotifySlot } from "../../services/api";
import { useHubAccess } from "../../auth/HubAccessContext";
import { formatDateHuman } from "./theme";
import type { BriefVariant, MarketingBrief, MarketingNotification, MarketingRequest, MarketingRole, MarketingUser, PrivateTask, PublicationPlatform, StageKey, TodoTask, VariantKey } from "./types";
import { STAGE_DEFS, stageLabel, addWorkDaysIso, todayIso, isPastDeadline, TODO_STAGE_DEFS, TODO_APPROVABLE_STAGES, todoStageLabel, VARIANT_DEFS, variantLabel, variantLabels, REQUEST_STAGE_DEFS, requestStageLabel } from "./types";

// Fallback recipients, used only until the marketing_notify_emails table has been seeded.
const DEFAULT_NOTIFY_EMAILS: MarketingNotifyEmails = {
  laura: "amazonassistant@formatucuerpo.com",
  carol: "",
  diseno_1: "marketplaces@formatucuerpo.com",
  diseno_2: "",
  diseno_3: "",
  diseno_1_country: "",
  diseno_2_country: "",
  diseno_3_country: "",
};

// Absolute link into the app for this email — the only way back in for someone with no Marketing
// role (a request's own requester), and a handy shortcut for everyone else.
function appUrl(path: string): string {
  return `${window.location.origin}${path}`;
}

function emailHtml(opts: { intro: string; reference: string; nextTask?: string; deadline?: string | null; note?: string; link?: string }): string {
  const { intro, reference, nextTask, deadline, note, link } = opts;
  return `
    <div style="font-family: -apple-system, sans-serif; color: #2C2A20;">
      <p>${intro}</p>
      <p><strong>Referencia:</strong> ${reference}</p>
      ${nextTask ? `<p><strong>Próxima tarea:</strong> ${nextTask}</p>` : ""}
      ${deadline ? `<p><strong>Deadline:</strong> ${formatDateHuman(deadline)}, 5:30 PM hora de Colombia</p>` : ""}
      ${note ? `<p><strong>Nota:</strong> ${note}</p>` : ""}
      ${link ? `<p><a href="${link}" style="display:inline-block;margin-top:10px;padding:10px 18px;background:#231F20;color:#fff;border-radius:6px;text-decoration:none;font-weight:700;">Ver y responder</a></p>` : ""}
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

  createBrief: (reference: string, productLine: string, startDate: string, briefLink: string, assignedDisenoEmail?: string, variantKeys?: VariantKey[]) => Promise<void>;
  createDraftBrief: (reference: string, productLine: string, estimatedStartDate: string, briefLink: string) => Promise<void>;
  publishBrief: (briefId: number, assignedDisenoEmail?: string) => Promise<void>;
  submitDesignStage: (briefId: number, link: string, note?: string) => Promise<void>;
  lauraReview: (briefId: number, action: "approve" | "request_changes", opts?: { link?: string; note?: string }) => Promise<void>;
  requestExtraRevision: (briefId: number, note?: string) => Promise<void>;
  confirmPublish: (briefId: number, note?: string) => Promise<void>;
  updateStageLink: (briefId: number, stageKey: StageKey, link: string) => Promise<void>;
  updatePublicationLink: (briefId: number, platform: PublicationPlatform, url: string) => Promise<void>;
  approvePublicationLinks: (briefId: number) => Promise<void>;
  assignBrief: (briefId: number, email: string) => Promise<void>;
  deleteBrief: (briefId: number) => Promise<void>;

  // Variants — up to 4 independent proposal/review pipelines inside one brief, only present
  // when that brief was created with at least one variant selected.
  submitVariantProposal: (briefId: number, variantKeys: VariantKey[], link: string, note?: string) => Promise<void>;
  variantLauraReview: (briefId: number, variantKey: VariantKey, action: "approve" | "request_changes", opts?: { link?: string; note?: string }) => Promise<void>;
  variantRequestExtraRevision: (briefId: number, variantKey: VariantKey, note?: string) => Promise<void>;
  variantConfirmPublish: (briefId: number, variantKey: VariantKey, note?: string) => Promise<void>;
  markVariantNotApplicable: (briefId: number, variantKey: VariantKey, reason: string) => Promise<void>;

  unreadCount: number;
  markNotificationRead: (id: number) => Promise<void>;
  deleteNotification: (id: number) => Promise<void>;
  clearAllNotifications: () => Promise<void>;

  // Personal reminders — visible only to whoever created them, for anyone in Marketing.
  privateTasks: PrivateTask[];
  createPrivateTask: (title: string, dueAt: string) => Promise<void>;
  togglePrivateTaskCompleted: (id: number, completed: boolean) => Promise<void>;
  deletePrivateTask: (id: number) => Promise<void>;

  // Carol's quick-turnaround To Do tasks — separate, shorter pipeline than Laura's briefs.
  todoTasks: TodoTask[];
  createTodoTask: (taskType: string, title: string, description: string, assignedDisenoEmail: string, emailNote?: string) => Promise<void>;
  advanceTodoTask: (id: number, link: string | undefined, note?: string) => Promise<void>;
  approveTodoTask: (id: number, note?: string) => Promise<void>;
  deleteTodoTask: (id: number) => Promise<void>;

  notifyEmails: MarketingNotifyEmails;
  disenoEmailList: string[];
  updateNotifyEmail: (slot: MarketingNotifySlot, email: string) => Promise<void>;
  // Human-friendly label for a Diseño email — that person's Hub Access nickname if they have
  // one, otherwise the raw email, otherwise "Diseño" when nobody is assigned.
  disenoDisplayName: (email: string | null) => string;
  // Which country that Diseño person's slot was configured with — "" if not set yet.
  disenoCountry: (email: string) => string;
  updateNotifyCountry: (slot: DisenoNotifySlot, country: string, email: string) => Promise<void>;

  // Requests — created via a public link by anyone with a company Microsoft login (no Marketing
  // role needed), always fulfilled by Diseño.
  requests: MarketingRequest[];
  createRequest: (opts: {
    taskType: string; title: string; description: string; attachments: string[]; sharedWithEmails: string[];
    deadline: string; assignedDisenoEmail?: string;
  }) => Promise<number>;
  assignRequest: (requestId: number, email: string) => Promise<void>;
  editRequest: (requestId: number, changes: { title: string; description: string }) => Promise<void>;
  deleteRequest: (requestId: number) => Promise<void>;
  submitRequestDelivery: (requestId: number, link: string, note?: string) => Promise<void>;
  requesterReview: (requestId: number, action: "approve" | "request_changes", opts?: { note?: string }) => Promise<void>;
}

const Ctx = createContext<MarketingCtx | null>(null);

export function useMarketing() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useMarketing must be used within MarketingProvider");
  return ctx;
}

export function MarketingProvider({ children }: { children: ReactNode }) {
  const { getRole, email: myEmail } = useHubAccess();
  const [briefs, setBriefs] = useState<MarketingBrief[]>([]);
  const [notifications, setNotifications] = useState<MarketingNotification[]>([]);
  const [privateTasks, setPrivateTasks] = useState<PrivateTask[]>([]);
  const [todoTasks, setTodoTasks] = useState<TodoTask[]>([]);
  const [requests, setRequests] = useState<MarketingRequest[]>([]);
  const [notifyEmails, setNotifyEmails] = useState<MarketingNotifyEmails>(DEFAULT_NOTIFY_EMAILS);
  // Keyed by lowercased email — sourced from each person's Hub Access nickname, so a name never
  // has to be typed twice (once for login access, once for Marketing notifications).
  const [nicknames, setNicknames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  // Every Diseño person shares the same "staff" role — the Microsoft login email is the only
  // thing that tells them apart, matched against the diseno_1/2/3 slots Laura configured.
  const authedUser: MarketingUser | null = useMemo(() => {
    const role = getRole("MARKETING");
    if (role === "admin") return { role: "laura", name: nicknames[myEmail.toLowerCase()] || "Laura", email: myEmail };
    if (role === "carol") return { role: "carol", name: nicknames[myEmail.toLowerCase()] || "Karol", email: myEmail };
    if (role === "staff") return { role: "diseno", name: nicknames[myEmail.toLowerCase()] || "Diseño", email: myEmail };
    return null;
  }, [getRole, myEmail, nicknames]);

  const disenoEmailList = useMemo(
    () => [notifyEmails.diseno_1, notifyEmails.diseno_2, notifyEmails.diseno_3].map(e => e.trim()).filter(Boolean),
    [notifyEmails],
  );

  const disenoDisplayName = (email: string | null): string => {
    if (!email) return "Diseño";
    return nicknames[email.toLowerCase()] || email;
  };

  const disenoCountryByEmail = useMemo(() => {
    const map: Record<string, string> = {};
    if (notifyEmails.diseno_1) map[notifyEmails.diseno_1.toLowerCase()] = notifyEmails.diseno_1_country;
    if (notifyEmails.diseno_2) map[notifyEmails.diseno_2.toLowerCase()] = notifyEmails.diseno_2_country;
    if (notifyEmails.diseno_3) map[notifyEmails.diseno_3.toLowerCase()] = notifyEmails.diseno_3_country;
    return map;
  }, [notifyEmails]);

  const disenoCountry = (email: string): string => disenoCountryByEmail[email.toLowerCase()] || "";

  // Someone with no Marketing role (just visiting the public request link) never needs
  // Briefs/To Do/private-task data — not fetching it at all (rather than just not rendering it)
  // keeps that data out of their browser entirely.
  const myRoleForLoad = getRole("MARKETING");
  const reload = useCallback(async () => {
    const hasInternalRole = !!myRoleForLoad;
    // Each query is isolated — if one of the newer tables/columns (requests, notification
    // actor/target tracking) isn't migrated in yet, that must never block Briefs/To Do/everything
    // else from loading. A single Promise.all here previously meant one failing query blanked
    // out the entire page.
    const safe = async <T,>(label: string, fn: () => Promise<T>, fallback: T): Promise<T> => {
      try { return await fn(); }
      catch (err) { console.error(`Failed to load ${label}:`, err); return fallback; }
    };
    const [n, rq, b, t, tt] = await Promise.all([
      safe("notifications", () => getMarketingNotifications(hasInternalRole ? undefined : myEmail), []),
      safe("requests", () => getMarketingRequests(hasInternalRole ? undefined : myEmail), []),
      hasInternalRole ? safe("briefs", () => getMarketingBriefs(), []) : Promise.resolve([]),
      hasInternalRole ? safe("private tasks", () => getPrivateTasks(myEmail), []) : Promise.resolve([]),
      hasInternalRole ? safe("todo tasks", () => getTodoTasks(), []) : Promise.resolve([]),
    ]);
    // Never show someone a notification about their own action — only about what others did.
    const others = n.filter(x => !x.actorEmail || x.actorEmail.toLowerCase() !== myEmail.toLowerCase());
    setNotifications(others); setRequests(rq); setBriefs(b); setPrivateTasks(t); setTodoTasks(tt);
  }, [myEmail, myRoleForLoad]);

  const createPrivateTask = async (title: string, dueAt: string) => {
    await apiCreatePrivateTask(myEmail, title, dueAt);
    await reload();
  };

  const togglePrivateTaskCompleted = async (id: number, completed: boolean) => {
    await apiTogglePrivateTaskCompleted(id, completed);
    await reload();
  };

  const deletePrivateTask = async (id: number) => {
    await apiDeletePrivateTask(id);
    await reload();
  };

  const buildTodoStages = (startDate: string) => TODO_STAGE_DEFS.map((def, i) => ({
    ...def, deadline: i === 0 ? addWorkDaysIso(startDate, def.gapDays) : null,
    link: null, completedAt: null, status: "pending" as const,
  }));

  const createTodoTask = async (taskType: string, title: string, description: string, assignedDisenoEmail: string, emailNote?: string) => {
    const today = todayIso();
    const stages = buildTodoStages(today);
    const created = await apiCreateTodoTask({
      taskType, title, description, assignedDisenoEmail, currentStage: "proposal", status: "in_progress", stages, completedAt: null,
    });
    await notify(null, `Karol asignó una nueva tarea to do: ${title}.${emailNote ? ` Nota: ${emailNote}` : ""}`);
    const emailBody = [description && `Descripción: ${description}`, emailNote && `Nota de Karol: ${emailNote}`].filter(Boolean).join(" — ") || undefined;
    await sendMarketingEmail(
      assignedDisenoEmail,
      `Nueva tarea (To Do) — ${title}`,
      emailHtml({ intro: "Karol te asignó una nueva tarea rápida.", reference: title, nextTask: todoStageLabel("proposal"), deadline: stages[0].deadline, note: emailBody, link: appUrl(`/marketing/todo/${created.id}`) }),
    );
    await reload();
  };

  // Every stage in the To Do pipeline is strictly sequential — whoever's turn it is submits
  // (a link for Diseño, an optional link/note for Carol) and it always moves to the next stage,
  // no approve/reject branching like briefs. The last stage (Carol's final approval) closes it out.
  const advanceTodoTask = async (id: number, link: string | undefined, note?: string) => {
    const task = todoTasks.find(t => t.id === id);
    if (!task || task.status === "completed") return;
    const stageIdx = task.stages.findIndex(s => s.key === task.currentStage);
    if (stageIdx === -1) return;
    const stage = task.stages[stageIdx];
    const today = todayIso();
    const isLate = !!stage.deadline && isPastDeadline(stage.deadline);
    const nextStage = task.stages[stageIdx + 1];
    const nextDeadline = nextStage ? addWorkDaysIso(today, nextStage.gapDays) : null;
    const newStages = task.stages.map((s, i) => {
      if (i === stageIdx) return { ...s, link: link ?? s.link, completedAt: today, status: "done" as const, late: isLate };
      if (nextStage && i === stageIdx + 1) return { ...s, deadline: nextDeadline };
      return s;
    });
    await updateTodoTask(id, {
      stages: newStages,
      currentStage: nextStage ? nextStage.key : "completed",
      status: nextStage ? "in_progress" : "completed",
      completedAt: nextStage ? null : today,
    });
    if (nextStage) {
      const recipient = nextStage.role === "diseno" ? task.assignedDisenoEmail : notifyEmails.carol;
      if (recipient) {
        await sendMarketingEmail(
          recipient,
          `Tu turno — ${task.title}`,
          emailHtml({
            intro: `Se avanzó la tarea "${task.title}". Te toca continuar.`,
            reference: task.title, nextTask: todoStageLabel(nextStage.key), deadline: nextDeadline,
            note: [note, stage.role === "carol" && link ? `Enlace con comentarios de ajuste: ${link}` : ""].filter(Boolean).join(" — ") || undefined,
            link: appUrl(`/marketing/todo/${task.id}`),
          }),
        );
      }
      await notify(null, `Avanzó la tarea to do "${task.title}" a ${todoStageLabel(nextStage.key)}.${isLate ? " (tarde)" : ""}${note ? ` Nota: ${note}` : ""}`);
    } else {
      await notify(null, `Tarea to do completada: ${task.title}.${isLate ? " (tarde)" : ""}`);
    }
    await reload();
  };

  // Karol can approve at either review stage: the task closes right there and the remaining
  // stages are marked skipped, so a good first delivery doesn't have to go through more rounds.
  const approveTodoTask = async (id: number, note?: string) => {
    const task = todoTasks.find(t => t.id === id);
    if (!task || task.status === "completed") return;
    if (authedUser?.role !== "carol") throw new Error("Solo Karol puede aprobar esta tarea.");
    const stageIdx = task.stages.findIndex(s => s.key === task.currentStage);
    const stage = task.stages[stageIdx];
    if (!stage || !TODO_APPROVABLE_STAGES.includes(stage.key)) throw new Error("Esta etapa no se puede aprobar directamente.");
    const today = todayIso();
    const isLate = !!stage.deadline && isPastDeadline(stage.deadline);
    const newStages = task.stages.map((s, i) => {
      if (i === stageIdx) return { ...s, completedAt: today, status: "done" as const, decision: "approved" as const, late: isLate };
      if (i > stageIdx) return { ...s, deadline: null, skipped: true };
      return s;
    });
    await updateTodoTask(id, { stages: newStages, currentStage: "completed", status: "completed", completedAt: today });
    await sendMarketingEmail(
      task.assignedDisenoEmail,
      `Aprobada — ${task.title}`,
      emailHtml({
        intro: `Karol aprobó "${task.title}" en ${todoStageLabel(stage.key)}. No hacen falta más ajustes.`,
        reference: task.title, note, link: appUrl(`/marketing/todo/${task.id}`),
      }),
    );
    await notify(null, `Karol aprobó la tarea to do "${task.title}" en ${todoStageLabel(stage.key)} — sin más rondas.${isLate ? " (tarde)" : ""}${note ? ` Nota: ${note}` : ""}`);
    await reload();
  };

  const deleteTodoTask = async (id: number) => {
    await apiDeleteTodoTask(id);
    await reload();
  };

  // The requester picks their own deadline for the first stage directly (not a start date fed
  // through a fixed gap) — later stages stay null until the previous one is actually done.
  const buildRequestStages = (firstDeadline: string) => REQUEST_STAGE_DEFS.map((def, i) => ({
    ...def, deadline: i === 0 ? firstDeadline : null,
    link: null, completedAt: null, status: "pending" as const,
  }));

  // If the requester picked a specific Diseño person, they get assigned and notified directly —
  // "No sé" leaves it unassigned, Carol gets notified and has 24h to assign it before the
  // round-robin timeout job (extended to also sweep marketing_requests) picks someone automatically.
  const notifyRequestLive = async (requestId: number, title: string, assignedDisenoEmail: string | null, deadline: string | null) => {
    const link = appUrl(`/marketing/request/${requestId}`);
    if (assignedDisenoEmail) {
      await sendMarketingEmail(
        assignedDisenoEmail,
        `Nueva solicitud — ${title}`,
        emailHtml({ intro: "Te asignaron una nueva solicitud.", reference: title, nextTask: requestStageLabel("delivery"), deadline, link }),
      );
      return;
    }
    if (notifyEmails.carol) {
      await sendMarketingEmail(
        notifyEmails.carol,
        `Nueva solicitud sin asignar — ${title}`,
        emailHtml({
          intro: "Hay una nueva solicitud (enviada por el enlace público) sin asignar. Entra a la plataforma y asígnala a alguien de Diseño — tienes 24 horas antes de que se asigne automáticamente.",
          reference: title, nextTask: requestStageLabel("delivery"), deadline, link: appUrl("/marketing/requests"),
        }),
      );
    }
  };

  // No Marketing role is required to create a request — anyone who can log in with their
  // company Microsoft account (the only auth this whole Hub uses) can reach the public link and
  // submit one, identified by whatever email they're logged in as. The row is created first so the
  // notification email can link straight to it.
  const createRequest = async (opts: {
    taskType: string; title: string; description: string; attachments: string[]; sharedWithEmails: string[];
    deadline: string; assignedDisenoEmail?: string;
  }): Promise<number> => {
    if (!myEmail) throw new Error("Debes iniciar sesión con tu correo corporativo.");
    const stages = buildRequestStages(opts.deadline);
    const assignedDisenoEmail = opts.assignedDisenoEmail ?? null;
    const carolNotifiedAt = assignedDisenoEmail ? null : new Date().toISOString();
    const created = await apiCreateMarketingRequest({
      requesterEmail: myEmail, taskType: opts.taskType, title: opts.title, description: opts.description,
      attachments: opts.attachments, sharedWithEmails: opts.sharedWithEmails,
      currentStage: "delivery", status: "in_progress",
      stages, revisionRounds: 0, completedAt: null, assignedDisenoEmail, carolNotifiedAt,
    });
    await notifyRequestLive(created.id, opts.title, assignedDisenoEmail, stages[0].deadline);
    await notify(null, `${nicknames[myEmail.toLowerCase()] || myEmail} creó una nueva solicitud: ${opts.title}.`);
    await reload();
    return created.id;
  };

  const assignRequest = async (requestId: number, email: string) => {
    const req = requests.find(r => r.id === requestId);
    await updateMarketingRequest(requestId, { assignedDisenoEmail: email, carolNotifiedAt: null });
    if (req) {
      const stage = req.stages.find(s => s.key === req.currentStage);
      await sendMarketingEmail(
        email,
        `Te asignaron una solicitud — ${req.title}`,
        emailHtml({ intro: "Te asignaron esta solicitud.", reference: req.title, nextTask: stage ? requestStageLabel(stage.key) : undefined, deadline: stage?.deadline ?? null, link: appUrl(`/marketing/request/${requestId}`) }),
      );
    }
    await reload();
  };

  // Laura and Karol manage the Solicitudes list: edit text, remove a request entirely.
  const editRequest = async (requestId: number, changes: { title: string; description: string }) => {
    if (authedUser?.role !== "laura" && authedUser?.role !== "carol") throw new Error("Solo Laura o Karol pueden editar solicitudes.");
    await updateMarketingRequest(requestId, { title: changes.title.trim(), description: changes.description.trim() });
    await reload();
  };

  const deleteRequest = async (requestId: number) => {
    if (authedUser?.role !== "laura" && authedUser?.role !== "carol") throw new Error("Solo Laura o Karol pueden eliminar solicitudes.");
    await deleteMarketingRequest(requestId);
    await reload();
  };

  const submitRequestDelivery = async (requestId: number, link: string, note?: string) => {
    const req = requests.find(r => r.id === requestId);
    if (!req || req.status === "completed") return;
    const stageIdx = req.stages.findIndex(s => s.key === req.currentStage);
    if (stageIdx === -1) return;
    const stage = req.stages[stageIdx];
    const today = todayIso();
    const isLate = !!stage.deadline && isPastDeadline(stage.deadline);
    const nextStage = req.stages[stageIdx + 1];
    const nextDeadline = nextStage ? addWorkDaysIso(today, nextStage.gapDays) : null;
    const newStages = req.stages.map((s, i) => {
      if (i === stageIdx) return { ...s, link, completedAt: today, status: "done" as const, late: isLate };
      if (nextStage && i === stageIdx + 1) return { ...s, deadline: nextDeadline };
      return s;
    });
    await updateMarketingRequest(requestId, { stages: newStages, currentStage: nextStage ? nextStage.key : req.currentStage });
    await notify(null, `Diseño entregó la solicitud "${req.title}".${isLate ? ` (tarde — vencía ${stage.deadline})` : ""}${note ? ` Nota: ${note}` : ""}`);
    if (nextStage) {
      await notifyRequester(req.id, req.requesterEmail, `Tu solicitud "${req.title}" ya tiene una entrega — te toca revisarla.`);
      for (const email of [req.requesterEmail, ...req.sharedWithEmails]) {
        await sendMarketingEmail(
          email,
          `Entrega lista para revisión — ${req.title}`,
          emailHtml({ intro: "Diseño entregó tu solicitud. Te toca revisarla.", reference: req.title, nextTask: requestStageLabel(nextStage.key), deadline: nextDeadline, note, link: appUrl(`/marketing/request/${req.id}`) }),
        );
      }
    }
    await reload();
  };

  // Only the original requester decides — shared viewers can watch but not approve/reject.
  const requesterReview = async (requestId: number, action: "approve" | "request_changes", opts?: { note?: string }) => {
    const req = requests.find(r => r.id === requestId);
    if (!req || req.status === "completed") return;
    if (!myEmail || req.requesterEmail.toLowerCase() !== myEmail.toLowerCase()) {
      throw new Error("Solo quien creó la solicitud puede aprobarla o pedir cambios.");
    }
    const stageIdx = req.stages.findIndex(s => s.key === req.currentStage);
    if (stageIdx === -1) return;
    const stage = req.stages[stageIdx];
    const today = todayIso();
    const isLate = !!stage.deadline && isPastDeadline(stage.deadline);

    if (action === "approve") {
      const newStages = req.stages.map(s => s.key === stage.key ? { ...s, completedAt: today, status: "done" as const, decision: "approved" as const, late: isLate } : s);
      await updateMarketingRequest(requestId, { stages: newStages, currentStage: "completed", status: "completed", completedAt: today });
      await notify(null, `Solicitud completada: ${req.title}.${isLate ? " (tarde)" : ""}`);
      if (req.assignedDisenoEmail) {
        await sendMarketingEmail(
          req.assignedDisenoEmail,
          `Aprobado — ${req.title}`,
          emailHtml({ intro: "El solicitante aprobó la entrega. La solicitud quedó completada.", reference: req.title, note: opts?.note, link: appUrl(`/marketing/request/${req.id}`) }),
        );
      }
      await reload();
      return;
    }

    const deliveryGap = REQUEST_STAGE_DEFS.find(s => s.key === "delivery")!.gapDays;
    const deliveryDeadline = addWorkDaysIso(today, deliveryGap);
    const newStages = req.stages.map(s => {
      if (s.key === "review") return { ...s, completedAt: today, status: "done" as const, decision: "changes_requested" as const, late: isLate };
      if (s.key === "delivery") return { ...s, status: "pending" as const, completedAt: null, link: null, late: false, deadline: deliveryDeadline };
      return s;
    });
    await updateMarketingRequest(requestId, { stages: newStages, currentStage: "delivery", revisionRounds: req.revisionRounds + 1 });
    await notify(null, `Se solicitaron cambios en: ${req.title}.${isLate ? " (tarde)" : ""}${opts?.note ? ` Nota: ${opts.note}` : ""}`);
    if (req.assignedDisenoEmail) {
      await sendMarketingEmail(
        req.assignedDisenoEmail,
        `Cambios solicitados — ${req.title}`,
        emailHtml({ intro: "El solicitante pidió cambios en la entrega.", reference: req.title, nextTask: requestStageLabel("delivery"), deadline: deliveryDeadline, note: opts?.note, link: appUrl(`/marketing/request/${req.id}`) }),
      );
    }
    await reload();
  };

  const loadNicknames = useCallback(async (emails: MarketingNotifyEmails) => {
    try {
      const map = await getHubNicknames([myEmail, emails.laura, emails.carol, emails.diseno_1, emails.diseno_2, emails.diseno_3]);
      setNicknames(map);
    } catch { /* nicknames are a display-only nicety — never block the app on this */ }
  }, [myEmail]);

  useEffect(() => {
    setLoading(true);
    reload().finally(() => setLoading(false));
    getMarketingNotifyEmails()
      .then(emails => {
        const merged = {
          laura: emails.laura || DEFAULT_NOTIFY_EMAILS.laura,
          carol: emails.carol || DEFAULT_NOTIFY_EMAILS.carol,
          diseno_1: emails.diseno_1 || DEFAULT_NOTIFY_EMAILS.diseno_1,
          diseno_2: emails.diseno_2 || DEFAULT_NOTIFY_EMAILS.diseno_2,
          diseno_3: emails.diseno_3 || DEFAULT_NOTIFY_EMAILS.diseno_3,
          diseno_1_country: emails.diseno_1_country || DEFAULT_NOTIFY_EMAILS.diseno_1_country,
          diseno_2_country: emails.diseno_2_country || DEFAULT_NOTIFY_EMAILS.diseno_2_country,
          diseno_3_country: emails.diseno_3_country || DEFAULT_NOTIFY_EMAILS.diseno_3_country,
        };
        setNotifyEmails(merged);
        loadNicknames(merged);
      })
      .catch(() => {});
  }, [reload, loadNicknames]);

  const updateNotifyEmail = async (slot: MarketingNotifySlot, email: string) => {
    await setMarketingNotifyEmail(slot, email);
    const next = { ...notifyEmails, [slot]: email };
    setNotifyEmails(next);
    await loadNicknames(next);
  };

  // `email` is passed in by the caller (not read from this closure's own notifyEmails) since the
  // caller may have just saved a new email for this same slot moments earlier in the same batch —
  // this component's state wouldn't have re-rendered yet to reflect that.
  const updateNotifyCountry = async (slot: DisenoNotifySlot, country: string, email: string) => {
    await setMarketingNotifyCountry(slot, country, email);
    setNotifyEmails(prev => ({ ...prev, [`${slot}_country`]: country }));
  };

  // Diseño-directed emails go only to whoever claimed the brief, once someone has —
  // otherwise everyone gets it, so anyone free can pick it up.
  const disenoRecipients = (brief: MarketingBrief): string[] =>
    brief.assignedDisenoEmail ? [brief.assignedDisenoEmail] : disenoEmailList;

  // Always stamped with whoever is doing the action right now — so it never shows back up as a
  // notification "to" that same person (you don't need to be told about your own action).
  // Best-effort, like sendMarketingEmail below — the in-app activity log must never block the
  // actual workflow action (creating a brief, assigning a task, etc.) just because a notification
  // failed to write (e.g. a newer column isn't migrated into this Supabase project yet).
  const notify = async (briefId: number | null, message: string) => {
    try { await createMarketingNotification(briefId, message, { actorEmail: myEmail }); }
    catch (err) { console.error("Failed to create notification:", err); }
  };

  // Pings one specific requester — never the shared laura/diseno/carol broadcast feed.
  const notifyRequester = async (requestId: number, requesterEmail: string, message: string) => {
    try { await createMarketingNotification(null, message, { targetEmail: requesterEmail, requestId, actorEmail: myEmail }); }
    catch (err) { console.error("Failed to create requester notification:", err); }
  };

  // A brief going live either has someone assigned already (Laura picked at creation/publish, or
  // Carol picked later) — that person gets emailed directly — or it doesn't, in which case Carol
  // gets notified and has 24h to assign it before the round-robin job picks someone automatically.
  const notifyBriefLive = async (briefId: number, reference: string, assignedDisenoEmail: string | null, deadline: string | null) => {
    const link = appUrl(`/marketing/brief/${briefId}`);
    if (assignedDisenoEmail) {
      await sendMarketingEmail(
        assignedDisenoEmail,
        `Nuevo brief — ${reference}`,
        emailHtml({ intro: "Te asignaron un nuevo brief.", reference, nextTask: stageLabel("proposal"), deadline, link }),
      );
      return;
    }
    if (notifyEmails.carol) {
      await sendMarketingEmail(
        notifyEmails.carol,
        `Nuevo brief sin asignar — ${reference}`,
        emailHtml({
          intro: "Hay un nuevo brief sin asignar. Entra a la plataforma y asígnalo a alguien de Diseño — tienes 24 horas antes de que se asigne automáticamente.",
          reference, nextTask: stageLabel("proposal"), deadline, link,
        }),
      );
    }
  };

  const buildStages = (startDate: string, briefLink: string) => STAGE_DEFS.map((def, i) => {
    if (i === 0) {
      return { ...def, deadline: startDate, link: briefLink || null, completedAt: startDate, status: "done" as const };
    }
    if (i === 1) {
      return { ...def, deadline: addWorkDaysIso(startDate, def.gapDays), link: null, completedAt: null, status: "pending" as const };
    }
    return { ...def, deadline: null, link: null, completedAt: null, status: "pending" as const };
  });

  // One independent stage pipeline per selected variant — unselected ones are "No aplica" from
  // the start, no justification needed since they were never meant to apply.
  const buildVariants = (startDate: string, variantKeys: VariantKey[]): BriefVariant[] | null => {
    if (variantKeys.length === 0) return null;
    return VARIANT_DEFS.map(def => variantKeys.includes(def.key)
      ? { key: def.key, applicable: true, naReason: null, currentStage: "proposal" as StageKey, status: "in_progress" as const, stages: buildStages(startDate, ""), lauraDelayDays: 0, designDelayCount: 0, extraRevisionRounds: 0, completedAt: null }
      : { key: def.key, applicable: false, naReason: null, currentStage: "completed" as const, status: "completed" as const, stages: [], lauraDelayDays: 0, designDelayCount: 0, extraRevisionRounds: 0, completedAt: null });
  };

  const createBrief = async (reference: string, productLine: string, startDate: string, briefLink: string, assignedDisenoEmail?: string, variantKeys?: VariantKey[]) => {
    const stages = buildStages(startDate, briefLink);
    const nextDeadline = addWorkDaysIso(startDate, STAGE_DEFS[1].gapDays);
    const carolNotifiedAt = assignedDisenoEmail ? null : new Date().toISOString();
    const created = await createMarketingBrief({
      reference, productLine, startDate, estimatedStartDate: null, currentStage: "proposal", status: "in_progress",
      stages, shiftDays: 0, lauraDelayDays: 0, designDelayCount: 0, extraRevisionRounds: 0,
      completedAt: null, publicationLinks: {}, linksApprovedByKarol: false,
      variants: buildVariants(startDate, variantKeys ?? []),
      assignedDisenoEmail: assignedDisenoEmail ?? null, carolNotifiedAt,
    });
    await notifyBriefLive(created.id, reference, assignedDisenoEmail ?? null, nextDeadline);
    await notify(null, `Laura creó un nuevo brief: ${reference}.`);
    await reload();
  };

  // A draft is a private planning placeholder — no stages run, nobody is notified, until Laura
  // publishes it (see publishBrief).
  const createDraftBrief = async (reference: string, productLine: string, estimatedStartDate: string, briefLink: string) => {
    const stages = STAGE_DEFS.map(def => ({ ...def, deadline: null, link: def.key === "brief" ? (briefLink || null) : null, completedAt: null, status: "pending" as const }));
    await createMarketingBrief({
      reference, productLine, startDate: estimatedStartDate, estimatedStartDate, currentStage: "brief", status: "draft",
      stages, shiftDays: 0, lauraDelayDays: 0, designDelayCount: 0, extraRevisionRounds: 0,
      completedAt: null, assignedDisenoEmail: null, carolNotifiedAt: null,
      publicationLinks: {}, linksApprovedByKarol: false, variants: null,
    });
    await reload();
  };

  const publishBrief = async (briefId: number, assignedDisenoEmail?: string) => {
    const brief = briefs.find(b => b.id === briefId);
    if (!brief || brief.status !== "draft") return;
    const today = todayIso();
    const stages = buildStages(today, brief.stages.find(s => s.key === "brief")?.link ?? "");
    const nextDeadline = addWorkDaysIso(today, STAGE_DEFS[1].gapDays);
    const carolNotifiedAt = assignedDisenoEmail ? null : new Date().toISOString();
    await updateMarketingBrief(briefId, {
      startDate: today, estimatedStartDate: null, currentStage: "proposal", status: "in_progress", stages,
      assignedDisenoEmail: assignedDisenoEmail ?? null, carolNotifiedAt,
    });
    await notifyBriefLive(briefId, brief.reference, assignedDisenoEmail ?? null, nextDeadline);
    await notify(null, `Laura publicó el brief: ${brief.reference}.`);
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
    await notify(briefId, `Diseño subió ${label} de ${brief.reference}.${isLate ? ` (tarde — vencía ${stage.deadline})` : ""}${note ? ` Nota: ${note}` : ""}`);
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
          link: appUrl(`/marketing/brief/${briefId}`),
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
      const isLateApprove = !!stage.deadline && isPastDeadline(stage.deadline);
      const publishStage = brief.stages.find(s => s.key === "publish")!;
      const publishDeadline = addWorkDaysIso(today, publishStage.gapDays);
      const newStages = brief.stages.map(s => {
        if (s.key === stage.key) return { ...s, completedAt: today, status: "done" as const, decision: "approved" as const, late: isLateApprove };
        if (s.key === "publish") return { ...s, deadline: publishDeadline };
        return s;
      });
      await updateMarketingBrief(briefId, { stages: newStages, currentStage: "publish", lauraDelayDays: brief.lauraDelayDays + (isLateApprove ? 1 : 0) });
      await notify(briefId, `Laura aprobó ${brief.reference} sin cambios — falta que Diseño confirme la publicación.${isLateApprove ? ` (tarde — vencía ${stage.deadline})` : ""}${opts?.note ? ` Nota: ${opts.note}` : ""}`);
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
            link: appUrl(`/marketing/brief/${briefId}`),
          }),
        );
      }
      await reload();
      return;
    }

    // request_changes: mark this review stage done. The next stage's deadline is always
    // `today + gapDays`, counted from Laura's actual completion — so a fast or slow review
    // never shrinks or balloons Diseño's next deadline. Laura's own lateness is still recorded
    // on the stage itself (for the delay history), it just never counts against Diseño's stats.
    const isLate = !!stage.deadline && isPastDeadline(stage.deadline);
    const nextStage = brief.stages[stageIdx + 1];
    const nextDeadline = nextStage ? addWorkDaysIso(today, nextStage.gapDays) : null;
    const newStages = brief.stages.map((s, i) => {
      if (i === stageIdx) {
        return {
          ...s, completedAt: today, status: "done" as const, decision: "changes_requested" as const,
          link: opts?.link ? opts.link : s.link, late: isLate,
        };
      }
      if (nextStage && i === stageIdx + 1) return { ...s, deadline: nextDeadline };
      return s;
    });
    await updateMarketingBrief(briefId, {
      stages: newStages,
      currentStage: nextStage ? nextStage.key : brief.currentStage,
      lauraDelayDays: brief.lauraDelayDays + (isLate ? 1 : 0),
    });
    await notify(briefId, `Laura solicitó ajustes en ${brief.reference}.${isLate ? ` (tarde — vencía ${stage.deadline})` : ""}${opts?.note ? ` Nota: ${opts.note}` : ""}`);
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
            link: appUrl(`/marketing/brief/${briefId}`),
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
    await notify(briefId, `Laura solicitó una revisión adicional en ${brief.reference}.${note ? ` Nota: ${note}` : ""}`);
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
          link: appUrl(`/marketing/brief/${briefId}`),
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
    await notify(briefId, `Diseño confirmó la publicación de ${brief.reference} — brief completado.${note ? ` Nota: ${note}` : ""}`);
    await sendMarketingEmail(
      notifyEmails.laura,
      `Publicado — ${brief.reference}`,
      emailHtml({ intro: "Diseño confirmó que ya se publicó. El brief quedó completado.", reference: brief.reference, note, link: appUrl(`/marketing/brief/${briefId}`) }),
    );
    await reload();
  };

  const updatePublicationLink = async (briefId: number, platform: PublicationPlatform, url: string) => {
    const brief = briefs.find(b => b.id === briefId);
    if (!brief) return;
    await updateMarketingBrief(briefId, { publicationLinks: { ...brief.publicationLinks, [platform]: url } });
    await reload();
  };

  const approvePublicationLinks = async (briefId: number) => {
    await updateMarketingBrief(briefId, { linksApprovedByKarol: true });
    await reload();
  };

  const updateStageLink = async (briefId: number, stageKey: StageKey, link: string) => {
    const brief = briefs.find(b => b.id === briefId);
    if (!brief) return;
    const newStages = brief.stages.map(s => s.key === stageKey ? { ...s, link } : s);
    await updateMarketingBrief(briefId, { stages: newStages });
    await reload();
  };

  const assignBrief = async (briefId: number, email: string) => {
    const brief = briefs.find(b => b.id === briefId);
    await updateMarketingBrief(briefId, { assignedDisenoEmail: email, carolNotifiedAt: null });
    if (brief) {
      const stage = brief.stages.find(s => s.key === brief.currentStage);
      await sendMarketingEmail(
        email,
        `Te asignaron un brief — ${brief.reference}`,
        emailHtml({ intro: "Te asignaron este brief.", reference: brief.reference, nextTask: stage ? stageLabel(stage.key) : undefined, deadline: stage?.deadline ?? null, link: appUrl(`/marketing/brief/${briefId}`) }),
      );
    }
    await reload();
  };

  // ── Variants — same stage-advance math as submitDesignStage/lauraReview/etc. above, just
  // scoped to one entry of brief.variants instead of the brief's own top-level stages. ──────────

  const recomputeBriefCompletion = (variants: BriefVariant[], today: string) => {
    const allDone = variants.every(v => !v.applicable || v.status === "completed");
    return allDone ? { status: "completed" as const, completedAt: today } : {};
  };

  const submitVariantProposal = async (briefId: number, variantKeys: VariantKey[], link: string, note?: string) => {
    const brief = briefs.find(b => b.id === briefId);
    if (!brief || !brief.variants || variantKeys.length === 0) return;
    const today = todayIso();
    let anyLate = false;
    let anyNextDeadline: string | null = null;
    const newVariants = brief.variants.map(v => {
      if (!variantKeys.includes(v.key) || !v.applicable || v.status === "completed") return v;
      const stageIdx = v.stages.findIndex(s => s.key === v.currentStage);
      const stage = v.stages[stageIdx];
      const isLate = !!stage.deadline && isPastDeadline(stage.deadline);
      if (isLate) anyLate = true;
      const nextStage = v.stages[stageIdx + 1];
      const nextDeadline = nextStage ? addWorkDaysIso(today, nextStage.gapDays) : null;
      anyNextDeadline = nextDeadline;
      const newStages = v.stages.map((s, i) => {
        if (i === stageIdx) return { ...s, link, completedAt: today, status: "done" as const, late: isLate };
        if (nextStage && i === stageIdx + 1) return { ...s, deadline: nextDeadline };
        return s;
      });
      return { ...v, stages: newStages, currentStage: nextStage ? nextStage.key : v.currentStage, designDelayCount: v.designDelayCount + (isLate ? 1 : 0) };
    });
    await updateMarketingBrief(briefId, { variants: newVariants, ...recomputeBriefCompletion(newVariants, today) });
    const labels = variantLabels(variantKeys);
    await notify(briefId, `Diseño subió una propuesta para ${labels} de ${brief.reference}.${anyLate ? " (una o más tarde)" : ""}${note ? ` Nota: ${note}` : ""}`);
    await sendMarketingEmail(
      notifyEmails.laura,
      `Tienes una revisión pendiente — ${brief.reference} (${labels})`,
      emailHtml({ intro: `Diseño subió una propuesta para ${labels}. Te toca revisar.`, reference: brief.reference, deadline: anyNextDeadline, note, link: appUrl(`/marketing/brief/${briefId}`) }),
    );
    await reload();
  };

  const variantLauraReview = async (briefId: number, variantKey: VariantKey, action: "approve" | "request_changes", opts?: { link?: string; note?: string }) => {
    const brief = briefs.find(b => b.id === briefId);
    if (!brief || !brief.variants) return;
    const variant = brief.variants.find(v => v.key === variantKey);
    if (!variant || variant.status === "completed") return;
    const today = todayIso();
    const label = variantLabel(variantKey);

    if (action === "approve") {
      const stage = variant.stages.find(s => s.key === variant.currentStage)!;
      const isLateApprove = !!stage.deadline && isPastDeadline(stage.deadline);
      const publishStage = variant.stages.find(s => s.key === "publish")!;
      const publishDeadline = addWorkDaysIso(today, publishStage.gapDays);
      const newStages = variant.stages.map(s => {
        if (s.key === stage.key) return { ...s, completedAt: today, status: "done" as const, decision: "approved" as const, late: isLateApprove };
        if (s.key === "publish") return { ...s, deadline: publishDeadline };
        return s;
      });
      const newVariants = brief.variants.map(v => v.key === variantKey ? { ...v, stages: newStages, currentStage: "publish" as StageKey, lauraDelayDays: v.lauraDelayDays + (isLateApprove ? 1 : 0) } : v);
      await updateMarketingBrief(briefId, { variants: newVariants });
      await notify(briefId, `Laura aprobó ${label} de ${brief.reference} — falta que Diseño confirme la publicación.${isLateApprove ? " (tarde)" : ""}${opts?.note ? ` Nota: ${opts.note}` : ""}`);
      for (const email of disenoRecipients(brief)) {
        await sendMarketingEmail(
          email,
          `Aprobado — confirma publicación de ${label} (${brief.reference})`,
          emailHtml({ intro: "Laura aprobó sin cambios. Falta que confirmes que ya se publicó.", reference: `${brief.reference} — ${label}`, nextTask: stageLabel("publish"), deadline: publishDeadline, note: opts?.note, link: appUrl(`/marketing/brief/${briefId}`) }),
        );
      }
      await reload();
      return;
    }

    const stageIdx = variant.stages.findIndex(s => s.key === variant.currentStage);
    const stage = variant.stages[stageIdx];
    const isLate = !!stage.deadline && isPastDeadline(stage.deadline);
    const nextStage = variant.stages[stageIdx + 1];
    const nextDeadline = nextStage ? addWorkDaysIso(today, nextStage.gapDays) : null;
    const newStages = variant.stages.map((s, i) => {
      if (i === stageIdx) return { ...s, completedAt: today, status: "done" as const, decision: "changes_requested" as const, link: opts?.link ? opts.link : s.link, late: isLate };
      if (nextStage && i === stageIdx + 1) return { ...s, deadline: nextDeadline };
      return s;
    });
    const newVariants = brief.variants.map(v => v.key === variantKey ? { ...v, stages: newStages, currentStage: nextStage ? nextStage.key : v.currentStage, lauraDelayDays: v.lauraDelayDays + (isLate ? 1 : 0) } : v);
    await updateMarketingBrief(briefId, { variants: newVariants });
    await notify(briefId, `Laura solicitó ajustes en ${label} de ${brief.reference}.${isLate ? " (tarde)" : ""}${opts?.note ? ` Nota: ${opts.note}` : ""}`);
    if (nextStage) {
      for (const email of disenoRecipients(brief)) {
        await sendMarketingEmail(
          email,
          `Ajustes solicitados — ${label} (${brief.reference})`,
          emailHtml({ intro: "Laura solicitó ajustes en la última entrega.", reference: `${brief.reference} — ${label}`, nextTask: stageLabel(nextStage.key), deadline: nextDeadline, note: opts?.note, link: appUrl(`/marketing/brief/${briefId}`) }),
        );
      }
    }
    await reload();
  };

  const variantRequestExtraRevision = async (briefId: number, variantKey: VariantKey, note?: string) => {
    const brief = briefs.find(b => b.id === briefId);
    if (!brief || !brief.variants) return;
    const variant = brief.variants.find(v => v.key === variantKey);
    if (!variant || variant.status === "completed") return;
    const today = todayIso();
    const label = variantLabel(variantKey);
    const adjustments2Gap = variant.stages.find(s => s.key === "adjustments2")!.gapDays;
    const adjustments2Deadline = addWorkDaysIso(today, adjustments2Gap);
    const newStages = variant.stages.map(s => {
      if (s.key === "adjustments2") return { ...s, status: "pending" as const, completedAt: null, link: null, decision: undefined, deadline: adjustments2Deadline };
      if (s.key === "final") return { ...s, status: "pending" as const, completedAt: null, decision: undefined, deadline: null };
      return s;
    });
    const newVariants = brief.variants.map(v => v.key === variantKey ? { ...v, stages: newStages, currentStage: "adjustments2" as StageKey, extraRevisionRounds: v.extraRevisionRounds + 1 } : v);
    await updateMarketingBrief(briefId, { variants: newVariants });
    await notify(briefId, `Laura solicitó una revisión adicional en ${label} de ${brief.reference}.${note ? ` Nota: ${note}` : ""}`);
    for (const email of disenoRecipients(brief)) {
      await sendMarketingEmail(
        email,
        `Revisión adicional — ${label} (${brief.reference})`,
        emailHtml({ intro: "Laura solicitó una revisión adicional sobre el cierre final.", reference: `${brief.reference} — ${label}`, nextTask: stageLabel("adjustments2"), deadline: adjustments2Deadline, note, link: appUrl(`/marketing/brief/${briefId}`) }),
      );
    }
    await reload();
  };

  const variantConfirmPublish = async (briefId: number, variantKey: VariantKey, note?: string) => {
    const brief = briefs.find(b => b.id === briefId);
    if (!brief || !brief.variants) return;
    const variant = brief.variants.find(v => v.key === variantKey);
    if (!variant || variant.status === "completed" || variant.currentStage !== "publish") return;
    const today = todayIso();
    const label = variantLabel(variantKey);
    const newStages = variant.stages.map(s => s.key === "publish" ? { ...s, completedAt: today, status: "done" as const } : s);
    const newVariants = brief.variants.map(v => v.key === variantKey ? { ...v, stages: newStages, currentStage: "completed" as const, status: "completed" as const, completedAt: today } : v);
    const completion = recomputeBriefCompletion(newVariants, today);
    await updateMarketingBrief(briefId, { variants: newVariants, ...completion });
    const allDone = "status" in completion;
    await notify(briefId, `Diseño confirmó la publicación de ${label} (${brief.reference}).${note ? ` Nota: ${note}` : ""}${allDone ? " — Brief completado." : ""}`);
    await sendMarketingEmail(
      notifyEmails.laura,
      allDone ? `Brief completado — ${brief.reference}` : `Publicado — ${label} (${brief.reference})`,
      emailHtml({
        intro: allDone ? "Todas las variantes fueron aprobadas y publicadas. El brief quedó completado." : "Diseño confirmó que esta variante ya se publicó.",
        reference: allDone ? brief.reference : `${brief.reference} — ${label}`, note,
        link: appUrl(`/marketing/brief/${briefId}`),
      }),
    );
    await reload();
  };

  const markVariantNotApplicable = async (briefId: number, variantKey: VariantKey, reason: string) => {
    if (!reason.trim()) throw new Error("Debes indicar una justificación.");
    const brief = briefs.find(b => b.id === briefId);
    if (!brief || !brief.variants) return;
    const today = todayIso();
    const newVariants = brief.variants.map(v => v.key === variantKey ? { ...v, applicable: false, naReason: reason.trim(), status: "completed" as const, currentStage: "completed" as const } : v);
    await updateMarketingBrief(briefId, { variants: newVariants, ...recomputeBriefCompletion(newVariants, today) });
    await notify(briefId, `${variantLabel(variantKey)} marcada como no aplica en ${brief.reference}. Motivo: ${reason.trim()}`);
    await reload();
  };

  const deleteBrief = async (briefId: number) => {
    if (authedUser?.role !== "laura") throw new Error("Solo Laura puede eliminar briefs.");
    await deleteMarketingBrief(briefId);
    await reload();
  };

  const readField = (role: "laura" | "diseno" | "carol") => role === "laura" ? "readLaura" as const : role === "carol" ? "readCarol" as const : "readDiseno" as const;

  // Someone with no Marketing role (tracking their own request via the public link) has their
  // own personal notifications (target_email) instead of a shared laura/diseno/carol inbox.
  const unreadCount = useMemo(() => {
    if (!authedUser) return notifications.filter(n => !n.readTarget).length;
    const field = readField(authedUser.role);
    return notifications.filter(n => !n[field]).length;
  }, [notifications, authedUser]);

  const markNotificationRead = async (id: number) => {
    if (!authedUser) {
      if (!myEmail) return;
      const notif = notifications.find(n => n.id === id);
      if (!notif || notif.readTarget) return;
      await markTargetNotificationRead(myEmail, id);
      await reload();
      return;
    }
    const field = readField(authedUser.role);
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
      createBrief, createDraftBrief, publishBrief, submitDesignStage, lauraReview, requestExtraRevision, confirmPublish, updateStageLink, updatePublicationLink, approvePublicationLinks, assignBrief, deleteBrief,
      submitVariantProposal, variantLauraReview, variantRequestExtraRevision, variantConfirmPublish, markVariantNotApplicable,
      unreadCount, markNotificationRead, deleteNotification, clearAllNotifications,
      privateTasks, createPrivateTask, togglePrivateTaskCompleted, deletePrivateTask,
      todoTasks, createTodoTask, advanceTodoTask, approveTodoTask, deleteTodoTask,
      notifyEmails, disenoEmailList, updateNotifyEmail, updateNotifyCountry, disenoDisplayName, disenoCountry,
      requests, createRequest, assignRequest, editRequest, deleteRequest, submitRequestDelivery, requesterReview,
    }}>
      {children}
    </Ctx.Provider>
  );
}

export type { MarketingRole };
