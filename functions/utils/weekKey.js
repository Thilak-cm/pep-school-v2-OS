const IST_TIMEZONE = "Asia/Kolkata";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function getIstDateParts(date = new Date()) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: IST_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const [yearStr, monthStr, dayStr] = formatter.format(date).split("-");
  return {
    year: Number(yearStr),
    month: Number(monthStr),
    day: Number(dayStr),
  };
}

function toUtcMidnight({ year, month, day }) {
  return new Date(Date.UTC(year, month - 1, day));
}

export function getIstIsoWeekKey(date = new Date()) {
  const parts = getIstDateParts(date);
  const localDate = toUtcMidnight(parts);
  const dayNumber = (localDate.getUTCDay() + 6) % 7; // Monday=0

  const thursday = new Date(localDate);
  thursday.setUTCDate(thursday.getUTCDate() - dayNumber + 3);

  const firstThursday = new Date(Date.UTC(thursday.getUTCFullYear(), 0, 4));
  const firstDayNumber = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayNumber + 3);

  const week =
    1 + Math.round((thursday.getTime() - firstThursday.getTime()) / (7 * MS_PER_DAY));
  const isoYear = thursday.getUTCFullYear();

  return `${isoYear}-W${String(week).padStart(2, "0")}`;
}

export function getIstMidnightDate(date = new Date()) {
  const parts = getIstDateParts(date);
  return toUtcMidnight(parts);
}

