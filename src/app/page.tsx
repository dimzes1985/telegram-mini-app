"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Bot,
  Calendar,
  Smartphone,
  Settings,
  ShieldCheck,
  Zap,
  Check,
  ArrowRight,
  MessageCircle,
  CreditCard,
  ChevronDown,
  Star,
  Sparkles,
} from "lucide-react";

// ---- Pricing data (mirrors src/lib/plans.ts) ----
const PLANS = [
  {
    id: "free",
    name: "Free",
    price: 0,
    priceYearly: 0,
    tagline: "Попробуйте всё сами",
    features: [
      "3 услуги",
      "50 сообщений ИИ / мес",
      "1 сотрудник",
      "Базовый брендинг",
      "Запись через Telegram",
      "Личный кабинет",
    ],
    cta: "Начать бесплатно",
    featured: false,
  },
  {
    id: "pro",
    name: "Pro",
    price: 1490,
    priceYearly: 1190,
    tagline: "Для растущего бизнеса",
    features: [
      "До 50 услуг",
      "1000 сообщений ИИ / мес",
      "До 3 сотрудников",
      "Свой брендинг",
      "Приоритетная поддержка",
      "Аналитика записей",
    ],
    cta: "Выбрать Pro",
    featured: true,
  },
  {
    id: "business",
    name: "Business",
    price: 4990,
    priceYearly: 3990,
    tagline: "Для сетей и больших команд",
    features: [
      "Безлимит услуг",
      "10000 сообщений ИИ / мес",
      "Безлимит сотрудников",
      "Свой брендинг",
      "Персональный менеджер",
      "Расширенная аналитика",
    ],
    cta: "Выбрать Business",
    featured: false,
  },
];

const FAQ_ITEMS = [
  {
    q: "Мне нужен свой Telegram-бот?",
    a: "Да, вы создаёте бота через @BotFather за 2 минуты. Мы автоматически подключим его к системе — вебхук, команды и кнопки настраиваются сами.",
  },
  {
    q: "Что нужно от меня для запуска?",
    a: "Ничего технического. Достаточно создать бота в Telegram, вставить его токен в личный кабинет и добавить свои услуги. Всё остальное система сделает сама.",
  },
  {
    q: "Как клиенты записываются?",
    a: "Клиент открывает вашего бота в Telegram, нажимает «Записаться» — и попадает в мини-приложение с календарём. Он видит только свободные слоты и записывается в одно касание.",
  },
  {
    q: "Что умеет ИИ-ассистент?",
    a: "ИИ отвечает на вопросы клиентов 24/7: подбирает услуги, рассказывает о ценах и часах работы, помогает записаться. Работает на базе GPT-4o и отвечает мгновенно.",
  },
  {
    q: "Можно ли отменить подписку?",
    a: "Да, в любой момент из личного кабинета. Оплата помесячная, никаких скрытых комиссий. Вы всегда можете вернуться на бесплатный план.",
  },
  {
    q: "Безопасны ли данные клиентов?",
    a: "Да. Все данные защищены: RLS-политики в базе не позволяют видеть чужие записи, API проверяет каждое действие, платёжные данные обрабатывает ЮKassa.",
  },
];

const TESTIMONIALS = [
  {
    name: "Анна",
    role: "Салон красоты, Москва",
    text: "Клиенты записываются прямо из Telegram, даже ночью. ИИ отвечает на вопросы, пока я занята руками. За первый месяц записей стало на 40% больше.",
    stars: 5,
  },
  {
    name: "Дмитрий",
    role: "Автомастерская, Казань",
    text: "Раньше половина звонков оставалась без ответа. Теперь клиент сам видит свободные окна и записывается. Освободил два часа в день на работу.",
    stars: 5,
  },
  {
    name: "Марина",
    role: "Студия маникюра, СПб",
    text: "Подключили за один вечер. ИИ сам подбирает клиентам покрытие и записывает. Это как второй администратор, который работает без выходных.",
    stars: 5,
  },
];

const USE_CASES = [
  {
    icon: <Sparkles className="h-6 w-6" />,
    title: "Салон красоты",
    desc: "Запись на маникюр, стрижку, окрашивание. ИИ подбирает услуги и свободное время.",
  },
  {
    icon: <Settings className="h-6 w-6" />,
    title: "Автомастерская",
    desc: "Диагностика, ТО, ремонт. Клиенты видят цены и записываются на удобное время.",
  },
  {
    icon: <Smartphone className="h-6 w-6" />,
    title: "Фитнес и тренеры",
    desc: "Персональные тренировки, расписание занятий, напоминания о записи.",
  },
  {
    icon: <Star className="h-6 w-6" />,
    title: "Клиники и косметология",
    desc: "Запись на приём, прайс процедур, безопасное хранение данных клиентов.",
  },
  {
    icon: <Zap className="h-6 w-6" />,
    title: "Репетиторы и курсы",
    desc: "Расписание уроков, оплата занятий, автоматические напоминания.",
  },
  {
    icon: <Calendar className="h-6 w-6" />,
    title: "Любой бизнес с записью",
    desc: "Маникюр, барбершопы, клининг, фотографы — всё, что работает по записи.",
  },
];

// Reveal-on-scroll hook and wrapper
function useReveal() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("reveal-visible");
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return ref;
}

function Reveal({
  children,
  className = "",
  delay = 0,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
}) {
  const ref = useReveal();
  return (
    <div
      ref={ref}
      className={`reveal ${className}`}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {children}
    </div>
  );
}

export default function Home() {
  const [yearly, setYearly] = useState(true);
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  return (
    <div className="min-h-screen bg-white">
      {/* ============ NAVBAR ============ */}
      <header className="sticky top-0 z-50 border-b border-gray-100 bg-white/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
          <div className="flex items-center gap-2">
            <Image
              src="/slot-wordmark.svg"
              alt="Slot"
              width={132}
              height={36}
              className="logo-shimmer cursor-pointer"
            />
          </div>
          <nav className="hidden items-center gap-8 text-sm text-gray-600 md:flex">
            <a href="#features" className="hover:text-gray-900">Возможности</a>
            <a href="#how" className="hover:text-gray-900">Как это работает</a>
            <a href="#cases" className="hover:text-gray-900">Кому подходит</a>
            <a href="#pricing" className="hover:text-gray-900">Тарифы</a>
          </nav>
          <div className="flex items-center gap-3">
            <Link href="/login" className="hidden text-sm text-gray-600 hover:text-gray-900 sm:block">
              Войти
            </Link>
            <Button size="lg" render={<Link href="/login" />}>
              Начать бесплатно
            </Button>
          </div>
        </div>
      </header>

      {/* ============ HERO ============ */}
      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-blue-50 via-white to-white" />
        <div className="animate-float-slow pointer-events-none absolute -top-40 left-1/2 h-96 w-96 -translate-x-1/2 rounded-full bg-blue-200/40 blur-3xl" />
        <div className="animate-float-slower pointer-events-none absolute -right-32 top-40 h-80 w-80 rounded-full bg-purple-200/40 blur-3xl" />
        <div className="animate-float-slow pointer-events-none absolute -left-32 bottom-0 h-72 w-72 rounded-full bg-pink-200/30 blur-3xl" />
        <div className="relative mx-auto max-w-6xl px-4 pb-20 pt-16 text-center">
          <div className="hero-in">
            <Badge variant="secondary" className="mb-6 gap-1.5 px-3 py-1.5 text-sm">
              <Sparkles className="h-3.5 w-3.5 text-blue-600" />
              ИИ-ассистент для вашего бизнеса уже в Telegram
            </Badge>
          </div>
          <h1 className="hero-in-delay-1 mx-auto max-w-3xl text-4xl font-bold leading-tight tracking-tight text-gray-900 md:text-6xl">
            Запись клиентов в Telegram и MAX{" "}
            <span className="text-gradient font-extrabold">
              без звонков и администратора
            </span>
          </h1>
          <p className="hero-in-delay-2 mx-auto mt-6 max-w-2xl text-lg text-gray-600">
            Готовая система бронирования + ИИ-менеджер на базе GPT-4o. Клиенты
            видят услуги, выбирают свободное время и записываются — прямо в вашем
            боте. Работает 24/7, вы платите только когда растёте.
          </p>
          <div className="hero-in-delay-3 mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button size="lg" className="animate-glow h-12 px-8 text-base" render={<Link href="/login" />}>
              Начать бесплатно
              <ArrowRight className="ml-1" />
            </Button>
            <Button size="lg" variant="outline" className="h-12 px-8 text-base" render={<Link href="#how" />}>
              Как это работает
            </Button>
          </div>
          <p className="hero-in-delay-3 mt-4 text-sm text-gray-500">
            Бесплатный план — без карты и обязательств
          </p>

          {/* Stats */}
          <div className="mx-auto mt-16 grid max-w-3xl grid-cols-1 gap-4 sm:grid-cols-3">
            {[
              { num: "2 мин", label: "до запуска" },
              { num: "24/7", label: "приём записей" },
              { num: "0 ₽", label: "старт бесплатно" },
            ].map((s) => (
              <div key={s.label} className="card-hover rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
                <div className="text-3xl font-bold text-gray-900">{s.num}</div>
                <div className="mt-1 text-sm text-gray-500">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ============ MARQUEE ============ */}
      <div className="marquee-mask overflow-hidden border-y border-gray-100 bg-gray-50/60 py-4">
        <div className="animate-marquee flex w-max gap-10 whitespace-nowrap">
          {[0, 1].map((dup) => (
            <div key={dup} className="flex gap-10" aria-hidden={dup === 1}>
              {[
                "⚡ Запись за 30 секунд",
                "🤖 ИИ-ассистент 24/7",
                "📱 Работает прямо в Telegram",
                "🛡 Защита данных клиентов",
                "💳 Оплата подписок онлайн",
                "📊 Аналитика в кабинете",
                "🚀 Запуск за один вечер",
              ].map((item) => (
                <span
                  key={item}
                  className="flex items-center gap-10 text-sm font-medium text-gray-500"
                >
                  {item}
                  <span className="h-1.5 w-1.5 rounded-full bg-gradient-to-r from-blue-600 to-purple-600" />
                </span>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* ============ FEATURES ============ */}
      <section id="features" className="mx-auto max-w-6xl px-4 py-20">
        <Reveal className="text-center">
          <h2 className="text-3xl font-bold text-gray-900 md:text-4xl">
            Всё для записи — в одном месте
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-gray-600">
            Ваш салон или мастерская получает полноценную CRM и онлайн-запись без
            дорогой разработки.
          </p>
        </Reveal>

        <div className="mt-12 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {[
            {
              icon: <Bot className="h-6 w-6" />,
              title: "ИИ-ассистент 24/7",
              desc: "GPT-4o отвечает клиентам, подбирает услуги и помогает записаться в любое время. Вы занимаетесь делом, а не чатами.",
              color: "bg-blue-50 text-blue-600",
            },
            {
              icon: <Calendar className="h-6 w-6" />,
              title: "Умное расписание",
              desc: "Клиенты видят только свободные слоты. Занятое время автоматически скрывается, пересечений нет.",
              color: "bg-green-50 text-green-600",
            },
            {
              icon: <MessageCircle className="h-6 w-6" />,
              title: "Запись за 30 секунд",
              desc: "Мини-приложение в Telegram: услуги, календарь, имя и телефон. Без установки приложений и звонков.",
              color: "bg-purple-50 text-purple-600",
            },
            {
              icon: <Settings className="h-6 w-6" />,
              title: "Личный кабинет",
              desc: "Управляйте услугами, ценами, часами работы и записями с телефона или компьютера. Всё обновляется мгновенно.",
              color: "bg-orange-50 text-orange-600",
            },
            {
              icon: <ShieldCheck className="h-6 w-6" />,
              title: "Безопасность данных",
              desc: "Данные клиентов защищены: изоляция записей, проверка API, безопасная оплата через ЮKassa.",
              color: "bg-red-50 text-red-600",
            },
            {
              icon: <CreditCard className="h-6 w-6" />,
              title: "Прозрачные тарифы",
              desc: "Начните бесплатно. Переходите на платный план, когда бизнес растёт. Отмена — в один клик.",
              color: "bg-cyan-50 text-cyan-600",
            },
          ].map((f, idx) => (
            <div
              key={f.title}
              className={`card-hover rounded-2xl border border-gray-100 p-6 shadow-sm transition-shadow hover:shadow-lg ${idx < 6 ? `stagger-${idx + 1}` : ""}`}
            >
              <div className={`mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl ${f.color}`}>
                {f.icon}
              </div>
              <h3 className="text-lg font-semibold text-gray-900">{f.title}</h3>
              <p className="mt-2 text-sm text-gray-600">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ============ HOW IT WORKS ============ */}
      <section id="how" className="bg-gray-50 py-20">
        <div className="mx-auto max-w-6xl px-4">
          <Reveal className="text-center">
            <h2 className="text-3xl font-bold text-gray-900 md:text-4xl">
              Запуск за один вечер
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-gray-600">
              Никакой настройки серверов и программистов. Три простых шага — и вы
              принимаете записи.
            </p>
          </Reveal>

          <div className="mt-12 grid grid-cols-1 gap-8 md:grid-cols-3">
            {[
              {
                step: "1",
                title: "Создайте бота",
                desc: "В @BotFather создайте бота за 2 минуты и вставьте его токен в личный кабинет.",
              },
              {
                step: "2",
                title: "Добавьте услуги",
                desc: "Название, цена и длительность. Клиенты сразу увидят их в вашем боте.",
              },
              {
                step: "3",
                title: "Принимайте записи",
                desc: "Отправьте клиентам ссылку на бота. Они записываются сами — вы только подтверждаете.",
              },
            ].map((s, idx) => (
              <div
                key={s.step}
                className={`relative rounded-2xl bg-white p-8 shadow-sm transition-all hover:-translate-y-1 hover:shadow-lg ${idx < 3 ? `stagger-${idx + 1}` : ""}`}
              >
                <div className="absolute -top-4 left-8 flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-r from-blue-600 to-purple-600 text-base font-bold text-white">
                  {s.step}
                </div>
                <h3 className="mt-4 text-lg font-semibold text-gray-900">{s.title}</h3>
                <p className="mt-2 text-sm text-gray-600">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ============ PRODUCT SHOWCASE ============ */}
      <section className="mx-auto max-w-6xl px-4 py-20">
        <Reveal className="text-center">
          <h2 className="text-3xl font-bold text-gray-900 md:text-4xl">
            Так это выглядит у ваших клиентов
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-gray-600">
            Реальные экраны: приветствие бота, выбор времени и живой диалог с
            ИИ-ассистентом. Всё внутри Telegram — ничего устанавливать не нужно.
          </p>
        </Reveal>
        <div className="mt-14 grid grid-cols-1 gap-10 md:grid-cols-3">
          {[
            {
              img: "/screenshot-bot-chat.svg",
              title: "Бот приветствует клиента",
              desc: "Кнопки-подсказки ведут клиента: услуги, информация, запись.",
            },
            {
              img: "/screenshot-booking.svg",
              title: "Выбор свободного времени",
              desc: "Клиент видит только свободные слоты и записывается в два касания.",
            },
            {
              img: "/screenshot-ai-chat.svg",
              title: "ИИ-ассистент ведёт диалог",
              desc: "Отвечает на вопросы, подбирает услуги и записывает клиента 24/7.",
            },
          ].map((s, idx) => (
            <Reveal
              key={s.title}
              delay={idx * 120}
              className="flex flex-col items-center rounded-2xl border border-gray-100 bg-gray-50/50 p-6 transition-all hover:-translate-y-1.5 hover:shadow-2xl"
            >
              <Image
                src={s.img}
                alt={s.title}
                width={270}
                height={548}
                className="rounded-[24px] shadow-lg transition-transform duration-500 hover:scale-[1.03]"
              />
              <h3 className="mt-6 text-center text-lg font-semibold text-gray-900">
                {s.title}
              </h3>
              <p className="mt-2 text-center text-sm text-gray-600">{s.desc}</p>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ============ USE CASES ============ */}
      <section id="cases" className="mx-auto max-w-6xl px-4 py-20">
        <Reveal className="text-center">
          <h2 className="text-3xl font-bold text-gray-900 md:text-4xl">
            Кому это подходит
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-gray-600">
            Всё, что работает по записи — теперь работает в Telegram.
          </p>
        </Reveal>
        <div className="mt-12 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {USE_CASES.map((c, idx) => (
            <div
              key={c.title}
              className={`group rounded-2xl border border-gray-100 p-6 transition-all hover:-translate-y-1 hover:border-blue-200 hover:shadow-lg ${idx < 6 ? `stagger-${idx + 1}` : ""}`}
            >
              <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-gray-100 text-gray-700 transition-colors group-hover:bg-blue-50 group-hover:text-blue-600">
                {c.icon}
              </div>
              <h3 className="text-lg font-semibold text-gray-900">{c.title}</h3>
              <p className="mt-2 text-sm text-gray-600">{c.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ============ PRICING ============ */}
      <section id="pricing" className="bg-gradient-to-b from-blue-50/60 to-white py-20">
        <div className="mx-auto max-w-6xl px-4">
          <Reveal className="text-center">
            <h2 className="text-3xl font-bold text-gray-900 md:text-4xl">
              Тарифы, которые растут вместе с вами
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-gray-600">
              Начните бесплатно. Переходите на следующий план, когда появится
              больше записей.
            </p>

            {/* Billing toggle */}
            <div className="mt-8 inline-flex items-center gap-3 rounded-full border border-gray-200 bg-white p-1.5 shadow-sm">
              <button
                onClick={() => setYearly(false)}
                className={`rounded-full px-5 py-2 text-sm font-medium transition-colors ${
                  !yearly ? "bg-blue-600 text-white" : "text-gray-600 hover:text-gray-900"
                }`}
              >
                Помесячно
              </button>
              <button
                onClick={() => setYearly(true)}
                className={`flex items-center gap-2 rounded-full px-5 py-2 text-sm font-medium transition-colors ${
                  yearly ? "bg-blue-600 text-white" : "text-gray-600 hover:text-gray-900"
                }`}
              >
                На год
                <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${yearly ? "bg-white/20" : "bg-green-100 text-green-700"}`}>
                  −20%
                </span>
              </button>
            </div>
          </Reveal>

          <div className="mt-12 grid grid-cols-1 gap-8 md:grid-cols-3">
            {PLANS.map((plan, idx) => {
              const price = yearly ? plan.priceYearly : plan.price;
              return (
                <div
                  key={plan.id}
                  className={`card-hover relative flex flex-col rounded-2xl p-8 ${
                    plan.featured
                      ? "border-2 border-blue-600 bg-white shadow-xl"
                      : "border border-gray-200 bg-white shadow-sm"
                  } ${idx < 3 ? `stagger-${idx + 1}` : ""}`}
                >
                  {plan.featured && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-blue-600 px-4 py-1 text-xs font-semibold text-white">
                      Популярный выбор
                    </div>
                  )}
                  <h3 className="text-lg font-semibold text-gray-900">{plan.name}</h3>
                  <p className="mt-1 text-sm text-gray-500">{plan.tagline}</p>
                  <div className="mt-4 flex items-baseline gap-1">
                    <span className="text-4xl font-bold text-gray-900">{price} ₽</span>
                    <span className="text-sm text-gray-500">/мес</span>
                  </div>
                  {yearly && plan.priceYearly < plan.price && (
                    <p className="mt-1 text-xs text-green-600">
                      При годовой оплате — экономия {(plan.price - plan.priceYearly) * 12} ₽ в год
                    </p>
                  )}
                  <ul className="mt-6 flex-1 space-y-3">
                    {plan.features.map((f) => (
                      <li key={f} className="flex items-start gap-2 text-sm text-gray-700">
                        <Check className="mt-0.5 h-4 w-4 shrink-0 text-green-600" />
                        {f}
                      </li>
                    ))}
                  </ul>
                  <Button
                    size="lg"
                    variant={plan.featured ? "default" : "outline"}
                    className="mt-8 w-full"
                    render={<Link href="/login" />}
                  >
                    {plan.cta}
                  </Button>
                </div>
              );
            })}
          </div>

          <p className="mt-8 text-center text-sm text-gray-500">
            Оплата помесячная. Отмена в один клик, без скрытых условий.
          </p>
        </div>
      </section>

      {/* ============ TESTIMONIALS ============ */}
      <section className="mx-auto max-w-6xl px-4 py-20">
        <Reveal className="text-center">
          <h2 className="text-3xl font-bold text-gray-900 md:text-4xl">
            Что говорят клиенты
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-gray-600">
            Реальные истории бизнесов, которые перешли на запись через Telegram.
          </p>
        </Reveal>
        <div className="mt-12 grid grid-cols-1 gap-6 md:grid-cols-3">
          {TESTIMONIALS.map((t, idx) => (
            <Reveal key={t.name} delay={idx * 120} className="card-hover flex flex-col rounded-2xl border border-gray-100 bg-gray-50/50 p-6 shadow-sm">
              <div className="mb-3 flex gap-0.5">
                {Array.from({ length: t.stars }).map((_, i) => (
                  <Star key={i} className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                ))}
              </div>
              <p className="flex-1 text-sm text-gray-700">«{t.text}»</p>
              <div className="mt-4 flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-r from-blue-600 to-purple-600 text-sm font-semibold text-white">
                  {t.name[0]}
                </div>
                <div>
                  <div className="text-sm font-semibold text-gray-900">{t.name}</div>
                  <div className="text-xs text-gray-500">{t.role}</div>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ============ FAQ ============ */}
      <section className="mx-auto max-w-3xl px-4 pb-20">
        <Reveal className="text-center">
          <h2 className="text-3xl font-bold text-gray-900 md:text-4xl">
            Частые вопросы
          </h2>
        </Reveal>
        <div className="mt-10 space-y-3">
          {FAQ_ITEMS.map((item, i) => (
            <Reveal
              key={i}
              delay={i * 60}
              className="overflow-hidden rounded-xl border border-gray-200 transition-all"
            >
              <button
                onClick={() => setOpenFaq(openFaq === i ? null : i)}
                className="flex w-full items-center justify-between px-5 py-4 text-left"
              >
                <span className="font-medium text-gray-900">{item.q}</span>
                <ChevronDown
                  className={`h-5 w-5 shrink-0 text-gray-500 transition-transform ${
                    openFaq === i ? "rotate-180" : ""
                  }`}
                />
              </button>
              {openFaq === i && (
                <div className="border-t border-gray-100 px-5 py-4 text-sm text-gray-600">
                  {item.a}
                </div>
              )}
            </Reveal>
          ))}
        </div>
      </section>

      {/* ============ FINAL CTA ============ */}
      <section className="mx-auto max-w-6xl px-4 pb-20">
        <Reveal>
          <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-blue-600 to-purple-600 px-8 py-16 text-center">
            <div className="animate-float-slow pointer-events-none absolute -top-20 right-0 h-64 w-64 rounded-full bg-white/10 blur-3xl" />
            <div className="animate-float-slower pointer-events-none absolute -bottom-24 left-0 h-72 w-72 rounded-full bg-white/10 blur-3xl" />
            <h2 className="relative mx-auto max-w-2xl text-3xl font-bold text-white md:text-4xl">
              Готовы принимать записи уже сегодня?
            </h2>
            <p className="relative mx-auto mt-4 max-w-xl text-blue-100">
              Подключите бесплатный план за 5 минут. Без карты, без обязательств,
              без скрытых платежей.
            </p>
            <div className="relative mt-8">
              <Button
                size="lg"
                className="animate-glow h-12 bg-white px-8 text-base text-blue-700 hover:bg-blue-50"
                render={<Link href="/login" />}
              >
                Начать бесплатно
                <ArrowRight className="ml-1" />
              </Button>
            </div>
          </div>
        </Reveal>
      </section>

      {/* ============ FOOTER ============ */}
      <footer className="border-t border-gray-100 py-10">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 sm:flex-row">
          <div className="flex items-center gap-2">
            <Image src="/slot-wordmark.svg" alt="Slot" width={110} height={30} />
          </div>
          <p className="text-sm text-gray-500">
            © {new Date().getFullYear()} Slot. Все права защищены.
          </p>
          <nav className="flex gap-6 text-sm text-gray-500">
            <a href="#features" className="hover:text-gray-900">Возможности</a>
            <a href="#pricing" className="hover:text-gray-900">Тарифы</a>
            <Link href="/login" className="hover:text-gray-900">Войти</Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
