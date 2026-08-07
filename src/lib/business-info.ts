export interface BusinessInfo {
  business_name: string;
  business_description: string | null;
  business_address: string | null;
  business_phone: string | null;
  business_email: string | null;
  working_hours?: Record<
    string,
    { start: string; end: string; enabled: boolean }
  > | null;
}

const DAY_LABELS_RU: Record<string, string> = {
  monday: "Пн",
  tuesday: "Вт",
  wednesday: "Ср",
  thursday: "Чт",
  friday: "Пт",
  saturday: "Сб",
  sunday: "Вс",
};

export function formatWorkingHours(
  workingHours?: BusinessInfo["working_hours"]
): string {
  if (!workingHours) return "—";
  const lines: string[] = [];
  const days = Object.keys(DAY_LABELS_RU);
  for (const day of days) {
    const hours = workingHours[day];
    if (!hours?.enabled) {
      lines.push(`${DAY_LABELS_RU[day]}: выходной`);
    } else {
      lines.push(`${DAY_LABELS_RU[day]}: ${hours.start} - ${hours.end}`);
    }
  }
  return lines.join("\n");
}

export function buildBusinessInfoText(business: BusinessInfo): string {
  const parts: string[] = [];

  parts.push(`🏢 <b>${business.business_name}</b>`);

  if (business.business_description) {
    parts.push(`\n${business.business_description}`);
  }

  if (business.business_address) {
    parts.push(`\n📍 Адрес: ${business.business_address}`);
  }
  if (business.business_phone) {
    parts.push(`📞 Телефон: ${business.business_phone}`);
  }
  if (business.business_email) {
    parts.push(`✉️ Email: ${business.business_email}`);
  }

  parts.push(`\n🕐 <b>Часы работы:</b>\n${formatWorkingHours(business.working_hours)}`);

  return parts.join("\n");
}
