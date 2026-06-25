// [::STUB::] P1-1: Tickets.json 読み込みの本実装は P1-1 で行う

export interface Ticket {
  id: number;
  phaseId: number;
  status: string;
  title: string;
}

export interface TicketsJson {
  tickets: Ticket[];
}

export function loadPendingTickets(path: string): Ticket[] {
  return [];
}

export function checkAllReviewed(tickets: Ticket[]): boolean {
  return true;
}

export function getSourceFromTickets(tickets: Ticket[]): string {
  return "";
}
