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

export async function getYookassaPayment(
  paymentId: string
): Promise<YookassaPayment> {
  const response = await fetch(`${YOOKASSA_API}/payments/${paymentId}`, {
    method: "GET",
    headers: {
      Authorization: authHeader(),
    },
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

// Published source IP ranges for ЮKassa webhook notifications.
// See: https://yookassa.ru/developers/using-api/webhooks
const YOOKASSA_WEBHOOK_IP_RANGES = [
  "185.71.76.0/27",
  "185.71.77.0/27",
  "77.75.153.0/25",
  "77.75.154.128/25",
  "2a02:5180:0:1509::/64",
  "2a02:5180:0:2655::/64",
  "2a02:5180:0:1533::/64",
  "2a02:5180:0:164c::/64",
];

function ipv4ToUint32(ip: string): number | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  let value = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const n = Number(part);
    if (n < 0 || n > 255) return null;
    value = (value << 8) | n;
  }
  return value >>> 0;
}

function ipv4InCidr(ip: string, cidr: string): boolean {
  const [network, bitsStr = "32"] = cidr.split("/");
  const bits = Number(bitsStr);
  const ipInt = ipv4ToUint32(ip);
  const netInt = ipv4ToUint32(network);
  if (
    ipInt === null ||
    netInt === null ||
    !Number.isInteger(bits) ||
    bits < 0 ||
    bits > 32
  ) {
    return false;
  }
  const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
  return (ipInt & mask) === (netInt & mask);
}

function ipv6ToHextets(ip: string): string[] | null {
  const lower = ip.toLowerCase();
  const parts = lower.split("::");
  if (parts.length > 2) return null;

  if (parts.length === 2) {
    const left = parts[0] ? parts[0].split(":") : [];
    const right = parts[1] ? parts[1].split(":") : [];
    const missing = 8 - left.length - right.length;
    if (missing < 0) return null;
    const all = [...left, ...Array<string>(missing).fill("0"), ...right];
    if (all.length !== 8) return null;
    return all.map((p) => p.padStart(4, "0"));
  }

  const all = parts[0].split(":");
  if (all.length !== 8) return null;
  return all.map((p) => p.padStart(4, "0"));
}

function ipv6InCidr(ip: string, cidr: string): boolean {
  const [network, bitsStr = "128"] = cidr.split("/");
  const bits = Number(bitsStr);
  const ipHex = ipv6ToHextets(ip);
  const netHex = ipv6ToHextets(network);
  if (
    !ipHex ||
    !netHex ||
    !Number.isInteger(bits) ||
    bits < 0 ||
    bits > 128
  ) {
    return false;
  }

  const fullHextets = Math.floor(bits / 16);
  for (let i = 0; i < fullHextets; i++) {
    if (ipHex[i] !== netHex[i]) return false;
  }
  const remainderBits = bits % 16;
  if (remainderBits > 0 && fullHextets < 8) {
    const ipRemainder = parseInt(ipHex[fullHextets], 16);
    const netRemainder = parseInt(netHex[fullHextets], 16);
    const shift = 16 - remainderBits;
    if ((ipRemainder >> shift) !== (netRemainder >> shift)) return false;
  }
  return true;
}

// Returns true when the caller's IP is one of the addresses ЮKassa uses to
// deliver webhook notifications.
export function isYookassaWebhookIp(ip: string): boolean {
  const normalized = ip.trim().toLowerCase();
  if (!normalized) return false;

  if (normalized.includes(":")) {
    return YOOKASSA_WEBHOOK_IP_RANGES.some(
      (range) => range.includes(":") && ipv6InCidr(normalized, range)
    );
  }
  return YOOKASSA_WEBHOOK_IP_RANGES.some(
    (range) => !range.includes(":") && ipv4InCidr(normalized, range)
  );
}
