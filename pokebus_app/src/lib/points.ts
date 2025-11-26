export const POINTS_PER_BUS_STOP = 10;

const padNumber = (value: number) => value.toString().padStart(2, "0");

export const getWeekStart = (date: Date): Date => {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const day = start.getDay();
  const diff = start.getDate() - day + (day === 0 ? -6 : 1);
  start.setDate(diff);
  start.setHours(0, 0, 0, 0);
  return start;
};

export const getMonthStart = (date: Date): Date => {
  const start = new Date(date.getFullYear(), date.getMonth(), 1);
  start.setHours(0, 0, 0, 0);
  return start;
};

export const getWeekKey = (date: Date): string => {
  const start = getWeekStart(date);
  return `${start.getFullYear()}-${padNumber(start.getMonth() + 1)}-${padNumber(start.getDate())}`;
};

export const getMonthKey = (date: Date): string => {
  const start = getMonthStart(date);
  return `${start.getFullYear()}-${padNumber(start.getMonth() + 1)}`;
};
