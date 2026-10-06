// Who runs the Slot platform: shown in the privacy policy and the consent.
// Fill in before launch (see README "Юридические данные").
export const LEGAL = {
  serviceName: "Slot",
  // Full name of the operator: "ИП Иванов Иван Иванович" or self-employed name.
  operatorName: process.env.NEXT_PUBLIC_LEGAL_OPERATOR_NAME || "Кулешов Дмитрий Геннадьевич (самозанятый, плательщик НПД)",
  operatorInn: process.env.NEXT_PUBLIC_LEGAL_OPERATOR_INN || "683001099891",
  // Address for personal data requests and consent withdrawal.
  contactEmail: process.env.NEXT_PUBLIC_LEGAL_EMAIL || "diman-68@mail.ru",
  siteUrl: "https://telegram-mini-app-uvr.vercel.app",
  // Date of the current edition of the documents.
  updatedAt: "06.10.2026",
};
