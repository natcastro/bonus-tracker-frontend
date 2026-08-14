import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import type { HubOrder, HubLocation, HubRole, HubUser, Platform } from "./types";
import { INITIAL_ORDERS } from "./mockData";

export const HUB_PASSWORD = "123456";
const HUB_SESSION_KEY = "logistics_hub_user_email";
const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
let shopifyCounter = 2305;
let userCounter = 100;

const INITIAL_USERS: HubUser[] = [
  { id: "u1", name: "Natalie", email: "natalie@formatucuerpo.com", role: "admin" },
  { id: "u2", name: "Diego", email: "diego@formatucuerpo.com", role: "logistics" },
  { id: "u3", name: "Usuario Belier", email: "belier@formatucuerpo.com", role: "Belier" },
  { id: "u4", name: "Usuario Norte", email: "norte@formatucuerpo.com", role: "Norte" },
  { id: "u5", name: "Usuario Plaza", email: "plaza@formatucuerpo.com", role: "Plaza" },
];

function nowIso() {
  return new Date().toISOString();
}

interface LogisticsHubCtx {
  orders: HubOrder[];
  authedUser: HubUser | null;
  currentUser: string;
  login: (email: string, password: string) => { ok: boolean; error?: string };
  logout: () => void;
  role: HubRole;
  setRole: (r: HubRole) => void;
  users: HubUser[];
  addUser: (u: { name: string; email: string; role: HubRole }) => void;
  removeUser: (id: string) => void;
  selectedOrderId: string | null;
  openOrder: (id: string) => void;
  closeOrder: () => void;
  getOrder: (id: string) => HubOrder | undefined;
  addManualOrder: (input: {
    platform: Platform; orderId: string; product: string; sku: string; qty: number; createdAt: string;
  }) => { ok: boolean; error?: string };

  assignOrder: (
    orderId: string,
    location: HubLocation,
    onStep?: (msg: string) => void
  ) => Promise<{ ok: boolean; error?: string; shopifyNumber?: string }>;
  saveLabelUrl: (orderId: string, url: string) => void;
  saveInvoiceManual: (orderId: string) => void;
  viewLabel: (orderId: string, byLabel: string) => void;
  viewInvoice: (orderId: string, byLabel: string) => void;
  completeOrder: (orderId: string, completedBy: string) => void;
  retryAttention: (orderId: string, onStep?: (msg: string) => void) => Promise<void>;
}

const Ctx = createContext<LogisticsHubCtx | null>(null);

export function LogisticsHubProvider({ children }: { children: ReactNode }) {
  const [orders, setOrders] = useState<HubOrder[]>(INITIAL_ORDERS);
  const [users, setUsers] = useState<HubUser[]>(INITIAL_USERS);
  const [authedUser, setAuthedUser] = useState<HubUser | null>(() => {
    const savedEmail = sessionStorage.getItem(HUB_SESSION_KEY);
    if (!savedEmail) return null;
    return INITIAL_USERS.find((u) => u.email.toLowerCase() === savedEmail.toLowerCase()) ?? null;
  });
  const [role, setRole] = useState<HubRole>(authedUser?.role ?? "admin");
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);

  const currentUserName = authedUser?.name ?? "Usuario";

  const login = (email: string, password: string): { ok: boolean; error?: string } => {
    if (password !== HUB_PASSWORD) return { ok: false, error: "Contraseña incorrecta." };
    const match = users.find((u) => u.email.toLowerCase() === email.trim().toLowerCase());
    if (!match) return { ok: false, error: "No existe un usuario con ese correo. Pídele a un admin que te cree uno en Usuarios." };
    setAuthedUser(match);
    setRole(match.role);
    sessionStorage.setItem(HUB_SESSION_KEY, match.email);
    return { ok: true };
  };

  const logout = () => {
    setAuthedUser(null);
    sessionStorage.removeItem(HUB_SESSION_KEY);
  };

  const addUser = (u: { name: string; email: string; role: HubRole }) => {
    setUsers((prev) => [...prev, { id: `u${userCounter++}`, ...u }]);
  };

  const removeUser = (id: string) => {
    setUsers((prev) => prev.filter((u) => u.id !== id));
  };

  const updateOrder = (id: string, patch: Partial<HubOrder>, activityText?: string) => {
    setOrders((prev) =>
      prev.map((o) => {
        if (o.id !== id) return o;
        const next = { ...o, ...patch };
        if (activityText) next.activity = [...o.activity, { time: nowIso(), text: activityText }];
        return next;
      })
    );
  };

  const addManualOrder = (input: {
    platform: Platform; orderId: string; product: string; sku: string; qty: number; createdAt: string;
  }): { ok: boolean; error?: string } => {
    if (orders.some((o) => o.id === input.orderId)) {
      return { ok: false, error: "Ya existe una orden con ese número." };
    }
    const newOrder: HubOrder = {
      id: input.orderId,
      platform: input.platform,
      createdAt: input.createdAt,
      product: input.product,
      sku: input.sku,
      qty: input.qty,
      status: "unassigned",
      invoiceStatus: "none",
      labelStatus: "none",
      activity: [{ time: nowIso(), text: `Orden agregada manualmente por ${currentUserName} (no detectada automáticamente por la integración).` }],
    };
    setOrders((prev) => [...prev, newOrder]);
    return { ok: true };
  };

  const assignOrder = async (
    orderId: string,
    location: HubLocation,
    onStep?: (msg: string) => void
  ): Promise<{ ok: boolean; error?: string; shopifyNumber?: string }> => {
    if (location === "Colombia") {
      onStep?.("Asignando ubicación…");
      await delay(700);
      updateOrder(
        orderId,
        {
          location,
          status: "pending_logistics",
          invoiceStatus: "none",
          labelStatus: "none",
          assignedBy: currentUserName,
          assignedAt: nowIso(),
        },
        `Asignada a Colombia por ${currentUserName}.`
      );
      updateOrder(orderId, {}, "Colombia: factura y label requieren carga manual.");
      onStep?.("Orden asignada correctamente.");
      return { ok: true };
    }

    onStep?.("Asignando ubicación en Shopify…");
    await delay(900);
    const shopifyNumber = `#${shopifyCounter++}`;
    updateOrder(
      orderId,
      { location, shopifyNumber, assignedBy: currentUserName, assignedAt: nowIso() },
      `Asignada a ${location} por ${currentUserName}.`
    );
    updateOrder(orderId, {}, "Ubicación de despacho actualizada en Shopify.");

    onStep?.("Generando factura en Odoo…");
    await delay(900);
    updateOrder(
      orderId,
      { status: "pending_logistics", invoiceStatus: "ready", labelStatus: "missing" },
      "Factura generada automáticamente en Odoo."
    );

    onStep?.("Orden asignada correctamente.");
    return { ok: true, shopifyNumber };
  };

  const recomputeAfterDocs = (id: string) => {
    setOrders((prev) =>
      prev.map((o) => {
        if (o.id !== id) return o;
        if (o.status === "pending_logistics" && o.invoiceStatus === "ready" && o.labelStatus === "ready") {
          return {
            ...o,
            status: "pending_store",
            activity: [...o.activity, { time: nowIso(), text: `Orden lista para ${o.location}. Pendiente de tienda.` }],
          };
        }
        return o;
      })
    );
  };

  const saveLabelUrl = (orderId: string, url: string) => {
    updateOrder(orderId, { labelStatus: "ready", labelUrl: url }, "Label agregado por usuario de Logística.");
    recomputeAfterDocs(orderId);
  };

  const saveInvoiceManual = (orderId: string) => {
    updateOrder(orderId, { invoiceStatus: "ready" }, "Factura cargada manualmente.");
    recomputeAfterDocs(orderId);
  };

  const viewLabel = (orderId: string, byLabel: string) => {
    setOrders((prev) =>
      prev.map((o) => {
        if (o.id !== orderId || o.labelViewedAt) return o;
        return { ...o, labelViewedAt: nowIso(), activity: [...o.activity, { time: nowIso(), text: `Label visto por ${byLabel}.` }] };
      })
    );
  };

  const viewInvoice = (orderId: string, byLabel: string) => {
    setOrders((prev) =>
      prev.map((o) => {
        if (o.id !== orderId || o.invoiceViewedAt) return o;
        return { ...o, invoiceViewedAt: nowIso(), activity: [...o.activity, { time: nowIso(), text: `Factura vista por ${byLabel}.` }] };
      })
    );
  };

  const completeOrder = (orderId: string, completedBy: string) => {
    updateOrder(
      orderId,
      { status: "completed", completedAt: nowIso(), completedBy },
      `Orden completada por ${completedBy}.`
    );
  };

  const retryAttention = async (orderId: string, onStep?: (msg: string) => void) => {
    onStep?.("Reintentando generación de factura en Odoo…");
    await delay(1000);
    updateOrder(
      orderId,
      { status: "pending_logistics", invoiceStatus: "ready", labelStatus: "missing", attentionReason: undefined, failedSteps: undefined },
      "Reintento exitoso: factura generada en Odoo."
    );
    onStep?.("Resuelto.");
  };

  const value = useMemo<LogisticsHubCtx>(
    () => ({
      orders,
      authedUser,
      currentUser: currentUserName,
      login,
      logout,
      role,
      setRole,
      users,
      addUser,
      removeUser,
      selectedOrderId,
      openOrder: (id) => setSelectedOrderId(id),
      closeOrder: () => setSelectedOrderId(null),
      getOrder: (id) => orders.find((o) => o.id === id),
      addManualOrder,
      assignOrder,
      saveLabelUrl,
      saveInvoiceManual,
      viewLabel,
      viewInvoice,
      completeOrder,
      retryAttention,
    }),
    [orders, authedUser, role, users, selectedOrderId]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useLogisticsHub() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useLogisticsHub must be used within LogisticsHubProvider");
  return ctx;
}
