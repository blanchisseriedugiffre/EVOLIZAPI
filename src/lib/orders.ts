/**
 * Shared types and helpers for orders.
 */
export type OrderStatus = "todo" | "in_progress" | "done";

export const STATUS_LABEL: Record<OrderStatus, string> = {
  todo: "À faire",
  in_progress: "En cours",
  done: "Terminée",
};

export const STATUS_NEXT: Record<OrderStatus, OrderStatus> = {
  todo: "in_progress",
  in_progress: "done",
  done: "todo",
};

export const STATUS_ROW_CLASS: Record<OrderStatus, string> = {
  todo: "bg-status-todo",
  in_progress: "bg-status-progress",
  done: "bg-status-done",
};

export const STATUS_BADGE_CLASS: Record<OrderStatus, string> = {
  todo: "bg-status-todo text-status-todo-fg ring-status-todo-fg/20",
  in_progress: "bg-status-progress text-status-progress-fg ring-status-progress-fg/20 border border-border",
  done: "bg-status-done text-status-done-fg ring-status-done-fg/20",
};

export const DAYS_FR = ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"];
export const DAYS_FR_LONG = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];
