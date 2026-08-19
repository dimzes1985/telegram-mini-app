const YOOKASSA_API = "https://api.yookassa.ru/v3";

function getConfig() {
  const shopId = process.env.YOOKASSA_SHOP_ID;
  const secretKey = process.env.YOOKASSA_SECRET_KEY;
  if (!shopId || !secretKey) {
    throw new Error("YOOKASSA_SHOP_ID and YOOKASSA_SECRET_KEY must be configured");
  }
  return { shopId, secretKey };
}

function authHeader(): string {
  const { shopId, secretKey } = getConfig();
  const token = Buffer.from(`${shopId}:${secretKey}`).toString("base64");
  return `Basic ${token}`;
}

const IdempotenceKey = (): string =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

export interface CreatePaymentParams {
  amount: number;
  currency?: string;
  description: string;
  returnUrl: string;
  metadata?: Record<string, string>;
  savePaymentMethod?: boolean;
  paymentMethodId?: string;
}

export interface YookassaPayment {
  id: string;
  status: string;
  amount: { value: string; currency: string };
  payment_method?: { id: string; saved?: boolean };
  confirmation?: { type: string; confirmation_url?: string };
  description?: string;
  metadata?: Record<string, string>;
}

export async function createYookassaPayment(
  params: CreatePaymentParams
): Promise<YookassaPayment> {
  const body: Record<string, unknown> = {
    amount: {
      value: params.amount.toFixed(2),
      currency: params.currency || "RUB",
    },
    capture: true,
    description: params.description,
    metadata: params.metadata,
  };

  if (params.savePaymentMethod && params.paymentMethodId) {
    // Recurring payment against a saved payment method
    body.payment_method_id = params.paymentMethodId;
  } else if (params.savePaymentMethod) {
    // Save the method for future recurring charges
    body.save_payment_method = true;
    body.confirmation = {
      type: "redirect",
      return_url: params.returnUrl,
    };
  } else {
    body.confirmation = {
      type: "redirect",
      return_url: params.returnUrl,
    };
  }

  const response = await fetch(`${YOOKASSA_API}/payments`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: authHeader(),
      "Idempotence-Key": IdempotenceKey(),
    },
    body: JSON.stringify(body),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(
      `ЮKassa error ${response.status}: ${data?.description || JSON.stringify(data)}`
    );
  }
  return data as YookassaPayment;
}

export async function cancelYookassaPayment(
  paymentId: string
): Promise<YookassaPayment> {
  const response = await fetch(`${YOOKASSA_API}/payments/${paymentId}/cancel`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: authHeader(),
      "Idempotence-Key": IdempotenceKey(),
    },
    body: "{}",
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(
      `ЮKassa error ${response.status}: ${data?.description || JSON.stringify(data)}`
    );
  }
  return data as YookassaPayment;
}

export interface YookassaPaymentMethod {
  id: string;
  type?: string;
  saved?: boolean;
  title?: string;
  card?: { first6?: string; last4?: string; card_type?: string };
}

export async function getYookassaPaymentMethod(
  paymentMethodId: string
): Promise<YookassaPaymentMethod> {
  const response = await fetch(
    `${YOOKASSA_API}/payment_methods/${paymentMethodId}`,
    {
      method: "GET",
      headers: {
        Authorization: authHeader(),
      },
    }
  );

  const data = await response.json();
  if (!response.ok) {
    throw new Error(
      `ЮKassa error ${response.status}: ${data?.description || JSON.stringify(data)}`
    );
  }
  return data as YookassaPaymentMethod;
}

export function isYookassaConfigured(): boolean {
  return Boolean(
    process.env.YOOKASSA_SHOP_ID && process.env.YOOKASSA_SECRET_KEY
  );
}
