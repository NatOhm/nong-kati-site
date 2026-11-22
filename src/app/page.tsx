import { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, Crown, ShoppingCart, Sparkles } from 'lucide-react';

import { FacebookLayout } from '@/components/layout/FacebookLayout';
import { Footer } from '@/components/layout/Footer';
import { ProductCard } from '@/components/product/ProductCard';
import { CategoryIcon } from '@/components/product/CategoryIcon';
import { ProductGrid } from '@/components/product/ProductGrid';
import { StructuredData } from '@/components/data-display/StructuredData';

import { HeroCarousel } from '@/components/home/HeroCarousel';
import { StatsCounter } from '@/components/home/StatsCounter';
import { TrustBadges } from '@/components/home/TrustBadges';
import { FAQAccordion } from '@/components/home/FAQAccordion';
import { LINEChatButton } from '@/components/home/LINEChatButton';
import { ScrollToTop } from '@/components/home/ScrollToTop';
import { ScrollReveal } from '@/components/home/ScrollReveal';
import { MascotHalo } from '@/components/ui/MascotHalo';
import { PolkaBackdrop } from '@/components/ui/PolkaBackdrop';
import { SiteMascot } from '@/components/ui/SiteMascot';
import { HamsterCelebrating, HamsterFace, HamsterWorried, PawIcon } from '@/components/ui/ClayIcons';

import {
  getCategoriesWithProductCounts,
  getFaqSettings,
  getFeaturedProducts,
  getHeroSlides,
  getStorefrontStats,
  getTrustBadgesSettings,
  getOgShareSettings,
} from '@/lib/data';
import { DEFAULT_TRUST_BADGES } from '@/lib/trustBadges';
import { featureAppGroupId, filterEmptyAppGroups, splitAppGroups } from '@/lib/appGroups';
import { publicOrigin } from '@/lib/siteConfig';
import { cn } from '@/utils/cn';

export const dynamic = 'force-dynamic';

/**
 * Floating brand chips around the hero mascot — the client mockup's four
 * app marks, reduced to typographic badges (no third-party logo files are
 * shipped). Decorative only: the wordmark beside the head already names the
 * shop, so these are `aria-hidden` and never the only label of anything.
 */
const HERO_CHIPS = [
  { label: 'N', bg: 'bg-clay-950', pos: '-left-1 top-3 -rotate-6' },
  { label: '♫', bg: 'bg-jade-700', pos: '-right-2 top-8 rotate-6' },
  { label: 'D+', bg: 'bg-sapphire-700', pos: '-left-2 bottom-12 rotate-3' },
  { label: '▶', bg: 'bg-crimson-500', pos: '-right-1 bottom-8 -rotate-3' },
];

/** Warm tints the category bento cycles through, matching the mockup. */
const BENTO_TINTS = [
  'bg-peach-100 dark:bg-peach-900/30',
  'bg-blush-50 dark:bg-coral-900/25',
  'bg-oat dark:bg-clay-800',
];

/**
 * Section heading with the mockup's crown + pill link. Local to the homepage
 * (no other page shares this shape yet), so it stays a function here rather
 * than a new component.
 */
function SectionHeading({
  title,
  href,
  hrefLabel = 'ดูทั้งหมด',
}: {
  title: string;
  href: string;
  hrefLabel?: string;
}): React.JSX.Element {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <h2 className="flex min-w-0 items-center gap-1.5 text-lg font-bold text-fg">
        <Crown size={18} className="shrink-0 text-amber-600" aria-hidden="true" />
        <span className="min-w-0 break-words leading-snug">{title}</span>
      </h2>
      <Link
        href={href}
        className="-my-3 inline-flex min-h-[44px] shrink-0 items-center gap-1 rounded-full border border-line bg-surface px-3 py-1.5 text-xs font-semibold text-fg-brand-strong shadow-clay-xs transition-colors hover:border-peach-300 hover:shadow-clay-sm"
      >
        {hrefLabel}
        <ArrowRight size={14} aria-hidden="true" />
      </Link>
    </div>
  );
}

/**
 * og:title / og:description are admin-editable at /management/og-share
 * (SiteSetting['ogShare'], see lib/ogShareSettings). The search snippet
 * (title/description) stays fixed — only the share-preview copy moves.
 */
export async function generateMetadata(): Promise<Metadata> {
  const og = await getOgShareSettings();
  return {
    // No manual brand suffix — the root template appends "— Nong-Kati" (audit #12).
    title: 'ซื้อแอคดูหนัง ซีรีส์ Netflix Spotify และอื่นๆ ราคาดี',
    description:
      'ซื้อแอคดูหนัง ซีรีส์ Netflix Spotify YouTube ราคาดี โอนเงินพร้อมส่งสลิปยืนยัน ทีมงานยืนยันแล้วส่งโค้ดถึงอีเมล',
    openGraph: {
      title: og.ogTitle,
      description: og.ogDescription,
      type: 'website',
      locale: 'th_TH',
      url: './',
    },
    alternates: { canonical: './' },
  };
}

export default async function HomePage(): Promise<React.JSX.Element> {
  // These six are independent, and every query costs a full round trip to the
  // remote MySQL (~200 ms each). Run them together instead of back to back:
  // the serial version measured 2.4 s of DB time on the homepage, the parallel
  // one ~1 s. allSettled keeps the old partial-degrade behaviour — one bad
  // fetcher no longer costs the sections that did load.
  const [categoriesR, featuredR, heroR, statsR, faqR, trustR] = await Promise.allSettled([
    getCategoriesWithProductCounts(),
    getFeaturedProducts(),
    getHeroSlides(),
    getStorefrontStats(),
    getFaqSettings(),
    getTrustBadgesSettings(),
  ] as const);

  const settle = <T,>(r: PromiseSettledResult<T>, fallback: T, label: string): T => {
    if (r.status === 'fulfilled') return r.value;
    console.error(
      `[HomePage] ${label} failed, rendering degraded state:`,
      r.reason instanceof Error ? r.reason.message : r.reason,
    );
    return fallback;
  };
  const dbDown = [categoriesR, featuredR, statsR].some((r) => r.status === 'rejected');
  const categories = settle(categoriesR, [], 'categories');
  const featuredProducts = settle(featuredR, [], 'featured products');
  const heroSlides = settle(heroR, [], 'hero slides');
  const stats: Awaited<ReturnType<typeof getStorefrontStats>> | null = settle(
    statsR,
    null,
    'storefront stats',
  );
  const faqSettings = settle(faqR, { enabled: true, items: [] }, 'faq settings');
  const trustBadges = settle(trustR, DEFAULT_TRUST_BADGES, 'trust badges');

  // Main groups keep their sub-apps instead of being flattened away (staff can
  // configure แอปดูหนัง/ซีรีส์ with children), then the empties are dropped so
  // the bento only ever shows categories a customer can actually buy in.
  const { groups: appGroups, looseApps } = filterEmptyAppGroups(splitAppGroups(categories));

  // The bento's wide tile: the group with the most products. Loose apps join
  // the grid after the groups so a flat catalogue still renders.
  const bentoTiles = [...appGroups, ...looseApps];
  const featureId = featureAppGroupId(appGroups);

  // Hero v2: a price anchor is the one thing the old hero never said, and it
  // needs no extra query — the featured variants are already awaited above.
  const heroPrices = featuredProducts.flatMap((p) => p.variants.map((v) => v.effectivePrice));
  const heroPrice = heroPrices.length > 0 ? Math.min(...heroPrices) : null;

  return (
    <>
      <StructuredData
        type="organization"
        data={{
          name: 'Nong-Kati',
          url: publicOrigin(),
          description: 'ซื้อ gift card ออนไลน์ โอนเงินแล้วทีมงานยืนยันและส่งโค้ด',
        }}
      />

      <FacebookLayout>
        {/* Hero carousel — admin-managed promo banners (hidden until configured) */}
        {heroSlides.length > 0 && <HeroCarousel slides={heroSlides} />}

        {/* Hero — the mockup's cream-to-pink band with the polka texture, the
            mascot in a dotted halo and the four app marks floating around it.
            `bg-peach-100` is a real background-color underlay (the contrast
            scanner follows background-color only); the gradient paints over it
            and `.polka` adds the dots without owning a colour.
            The mascot is a SIBLING of the copy, never its wrapper: a transformed
            ancestor would become the containing block for fixed descendants. */}
        <section className="relative overflow-hidden bg-peach-100 bg-gradient-to-b from-peach-200 via-peach-100 to-peach-50 px-4 pb-6 pt-5 md:px-8 md:pb-9 md:pt-8 dark:from-clay-900 dark:via-clay-900 dark:to-surface">
          <PolkaBackdrop className="opacity-90" />
          {/* Ambient light behind the mascot — static gradient, no animation */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -right-10 top-0 h-56 w-56 rounded-full bg-blush-200/50 blur-2xl md:h-80 md:w-80 dark:bg-peach-900/30"
          />

          <div className="relative mx-auto grid max-w-5xl grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] items-center gap-2 md:gap-8">
            <div className="relative z-10 min-w-0 text-left">
              <span className="inline-flex items-center gap-1 rounded-full bg-surface/85 px-2.5 py-1 text-[11px] font-semibold text-fg-brand-strong shadow-clay-xs">
                <Sparkles size={12} aria-hidden="true" />
                ร้านแอพพรีเมียม ของแท้ ราคาถูก
              </span>

              {/* Site-wide h1 (landmark spec). Two lines, capped at `sm` sizes:
                  the first-viewport contract fails if the headline grows past
                  two lines at 390px (spec C6). */}
              <h1 className="mt-2 break-words font-display text-[1.75rem] font-bold leading-[1.12] text-fg sm:text-4xl md:text-5xl">
                <span className="block">น้องกะทิ</span>
                <span className="block text-fg-brand-strong">แอพพรีเมียม</span>
              </h1>

              <p className="mt-2 text-sm font-medium leading-snug text-fg-secondary sm:text-base">
                จ่ายง่าย ได้โค้ด ดูหนัง ฟังเพลง
                <br className="sm:hidden" /> และอีกมากมายในที่เดียว!
              </p>

              {heroPrice !== null && (
                <p className="mt-1.5 text-xs font-semibold text-fg-brand-strong sm:text-sm">
                  เริ่ม ฿{heroPrice.toLocaleString('th-TH')} · ส่งโค้ดถึงอีเมลในไม่กี่นาที
                </p>
              )}

              <Link
                href="/search"
                className="transition-smart mt-4 inline-flex min-h-[48px] items-center justify-center gap-2 rounded-full bg-peach-500 px-7 py-2.5 text-base font-bold text-white shadow-clay-brand hover:bg-peach-400 hover:shadow-clay-lg active:scale-95 active:shadow-clay-press"
              >
                <ShoppingCart size={18} aria-hidden="true" />
                ช้อปเลย
                <ArrowRight size={18} aria-hidden="true" />
              </Link>
            </div>

            {/* Mascot cluster — halo, crown and the floating app marks are all
                decoration; the mascot itself is aria-hidden inside SiteMascot. */}
            <div className="relative mx-auto flex w-full max-w-[150px] items-center justify-center sm:max-w-[210px] md:max-w-[260px]">
              <MascotHalo className="inset-x-0 top-1/2 h-[92%] -translate-y-1/2 rounded-full bg-peach-200/70 dark:bg-peach-900/40" />
              <Crown
                size={22}
                className="absolute -top-2 left-1/2 z-10 -translate-x-1/2 -rotate-6 text-amber-600"
                aria-hidden="true"
              />
              <SiteMascot
                size={150}
                className="mascot-wave relative z-10 block w-fit !h-28 !w-28 drop-shadow-[0_6px_10px_rgba(147,107,73,0.26)] sm:!h-40 sm:!w-40 md:!h-52 md:!w-52"
              />
              {HERO_CHIPS.map((chip) => (
                <span
                  key={chip.label}
                  aria-hidden="true"
                  className={cn(
                    'absolute z-20 flex h-9 w-9 items-center justify-center rounded-2xl text-sm font-black text-white shadow-clay sm:h-10 sm:w-10',
                    chip.bg,
                    chip.pos,
                  )}
                >
                  {chip.label}
                </span>
              ))}
            </div>
          </div>
        </section>

        {/* Trust strip — directly under the hero, exactly as in the mockup */}
        <TrustBadges settings={trustBadges} />

        {/* How It Works — วิธีการซื้อ. Pill heading + three clay cards; the
            mockup's arrow flow is decorative (aria-hidden) and only appears
            once the cards sit side by side. */}
        <ScrollReveal>
          <section className="px-4 py-5 md:px-8 md:py-8">
            <div className="mx-auto max-w-4xl">
              <h2 className="mx-auto mb-4 flex w-fit items-center gap-1.5 rounded-full bg-peach-100 px-4 py-1.5 text-sm font-bold text-fg-brand-strong shadow-clay-xs dark:bg-peach-900/40 dark:text-peach-200">
                <PawIcon size={16} aria-hidden="true" />
                วิธีการซื้อ ง่ายๆ ใน 3 ขั้นตอน
              </h2>
              {/* `sm` is 480px in this project, and three cards there leave the
                  text column ~20px wide (one character per line). Side-by-side
                  starts at md (768px) instead. */}
              <div className="grid grid-cols-1 gap-3 md:grid-cols-3 md:gap-4">
                {[
                  {
                    step: '1',
                    title: 'เลือกสินค้า',
                    desc: 'เลือกประเภทบัตรและราคาที่ต้องการจากหน้าร้านของเรา',
                    // Sniffing around the shelves = browsing.
                    art: <HamsterFace size={52} className="mascot-sniff" />,
                  },
                  {
                    step: '2',
                    title: 'ชำระเงิน',
                    desc: 'โอนเงินแล้วส่งสลิปยืนยัน',
                    // Anxious waiting while the slip is checked — on-brand, and it
                    // sets up the payoff on step 03.
                    art: <HamsterWorried size={64} className="mascot-beg" />,
                  },
                  {
                    step: '3',
                    title: 'รับโค้ด',
                    desc: 'รับโค้ดหลังยืนยันการชำระเงิน',
                    // Code delivered.
                    art: <HamsterCelebrating size={60} className="mascot-celebrate" />,
                  },
                ].map((item, i) => (
                  <div
                    key={item.step}
                    className="relative flex items-center gap-3 rounded-2xl border border-line-subtle bg-surface p-4 text-left shadow-clay transition-transform duration-fast ease-out-quart hover:-translate-y-0.5"
                  >
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-peach-500 text-sm font-bold text-white shadow-clay-sm">
                      {item.step}
                    </span>
                    <div className="min-w-0 flex-1">
                      <h3 className="text-sm font-bold text-fg">{item.title}</h3>
                      <p className="text-xs leading-snug text-fg-muted">{item.desc}</p>
                    </div>
                    <span className="shrink-0">{item.art}</span>
                    {i < 2 && (
                      <ArrowRight
                        size={18}
                        aria-hidden="true"
                        className="absolute -right-[15px] top-1/2 hidden -translate-y-1/2 text-fg-placeholder md:block"
                      />
                    )}
                  </div>
                ))}
              </div>
            </div>
          </section>
        </ScrollReveal>

        {/* Data-outage alert (audit round 2 #4): during a DB outage the
            catalogue region must not silently render as an empty shop — an
            explicit recoverable alert replaces it. Server-rendered anchors
            only (no client handlers in this tree). */}
        {dbDown && (
          <section role="alert" className="px-4 pb-4 md:px-8">
            <div className="border-error bg-error mx-auto flex max-w-2xl flex-col items-center gap-3 rounded-2xl border px-6 py-6 text-center">
              <p className="text-lg font-bold text-fg">โหลดสินค้าไม่สำเร็จ</p>
              <p className="text-base text-fg-muted">
                ช่วงนี้ระบบขัดข้องชั่วคราว (ไม่ใช่เพราะสินค้าหมด) — ลองรีเฟรชอีกครั้ง
                หรือแวะร้านใหม่ภายหลัง
              </p>
              <div className="flex flex-wrap items-center justify-center gap-3">
                <Link
                  href="/"
                  className="transition-smart inline-flex min-h-[44px] items-center justify-center rounded-full bg-peach-500 px-6 text-sm font-semibold text-white shadow-clay-sm hover:bg-peach-400"
                >
                  ลองอีกครั้ง
                </Link>
                <Link
                  href="/orders/lookup"
                  className="transition-smart inline-flex min-h-[44px] items-center justify-center rounded-full border border-line bg-surface px-6 text-sm font-semibold text-fg hover:border-clay-400"
                >
                  ค้นหาคำสั่งซื้อเดิม
                </Link>
              </div>
            </div>
          </section>
        )}

        {/* Categories bento — group tiles only, no zero-product rows. The
            widest tile is the group with the most products (featureAppGroupId);
            loose categories join the same grid so a flat catalogue still
            renders. Each tile links to its category page. */}
        {bentoTiles.length > 0 && (
          <ScrollReveal>
            <section className="px-4 py-5 md:px-8 md:py-7">
              <div className="mx-auto max-w-5xl">
                <SectionHeading title="หมวดหมู่สินค้า" href="/search" />
                <div className="grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-4">
                  {bentoTiles.map((group, i) => {
                    const featured = group.id === featureId;
                    return (
                      <Link
                        key={group.id}
                        href={`/category/${group.slug}`}
                        className={cn(
                          'group relative flex min-h-[104px] flex-col justify-center overflow-hidden rounded-3xl border border-line-subtle p-4 shadow-clay transition-transform duration-fast ease-out-quart',
                          'hover:-translate-y-0.5 hover:shadow-clay-lg active:scale-[0.98] active:shadow-clay-press',
                          BENTO_TINTS[i % BENTO_TINTS.length],
                          featured && 'col-span-2 md:col-span-1',
                        )}
                      >
                        <span className="relative z-10 flex items-center gap-2">
                          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-surface/85 shadow-clay-xs">
                            <CategoryIcon
                              name={group.icon}
                              size={20}
                              className="text-fg-brand-strong"
                            />
                          </span>
                          <span className="min-w-0 break-words text-sm font-bold leading-snug text-fg">
                            {group.name}
                          </span>
                        </span>
                        <span className="relative z-10 mt-1.5 pl-11 text-xs font-medium text-fg">
                          มากกว่า {group.productCount ?? 0} รายการ
                        </span>
                        {group.imageUrl && (
                          // eslint-disable-next-line @next/next/no-img-element -- admin-upload/data-URL source: served immutable via /api/v1/images
                          <img
                            src={group.imageUrl}
                            alt=""
                            aria-hidden="true"
                            className="pointer-events-none absolute -bottom-4 -right-4 h-24 w-24 rounded-full object-cover opacity-85 shadow-clay-sm transition-transform duration-moderate ease-out-quart group-hover:scale-105"
                            loading="lazy"
                          />
                        )}
                      </Link>
                    );
                  })}
                </div>
              </div>
            </section>
          </ScrollReveal>
        )}

        {/* Featured Products Section */}
        {featuredProducts.length > 0 && (
          <ScrollReveal>
            <section className="px-4 py-5 md:px-8 md:py-7">
              <div className="mx-auto max-w-5xl">
                <SectionHeading title="สินค้าแนะนำ" href="/recommended" />
                <ProductGrid>
                  {featuredProducts.map((product) => (
                    <ProductCard
                      key={product.id}
                      id={product.id}
                      name={product.name}
                      slug={product.slug}
                      shortDescription={product.shortDescription}
                      imageUrl={product.imageUrl}
                      categoryName={product.category.name}
                      categorySlug={product.category.slug}
                      price={product.variants[0]?.effectivePrice ?? 0}
                      promotion={product.variants[0]?.promotion}
                      stock={product.variants.reduce((sum, v) => sum + v.stock, 0)}
                      variantId={product.variants[0]?.id}
                      variantCount={product.variants.length}
                      variants={product.variants.map((v) => ({
                        id: v.id,
                        label: v.label,
                        price: v.effectivePrice,
                        effectivePrice: v.effectivePrice,
                        stock: v.stock,
                        promotion: v.promotion,
                      }))}
                    />
                  ))}
                </ProductGrid>
              </div>
            </section>
          </ScrollReveal>
        )}

        {/* FAQ — admin-switchable: hidden entirely when the section is off */}
        {faqSettings.enabled && (
          <ScrollReveal>
            <FAQAccordion items={faqSettings.items} />
          </ScrollReveal>
        )}

        {/* Stats — real counts, plain numbers, horizontal, at the bottom (client ask).
            Hidden entirely during an outage: zero rows read as “no business”
            (audit round 2 #4) — they return with the data.
            Audit 2026-09-28: a fresh shop legitimately starts at 0 ลูกค้า /
            0 ขายแล้ว — “ลูกค้า 0” reads as “nobody shops here” and the old
            count-up animation froze at a fabricated zero on jank. Show only
            the numbers that say something real about the shop today. */}
        {stats && (
          <StatsCounter
            stats={[
              { value: stats.products, label: 'สินค้า' },
              { value: stats.stock, label: 'สต๊อก' },
            ]}
          />
        )}
      </FacebookLayout>

      <Footer />

      {/* Client-side overlays */}
      <LINEChatButton />
      <ScrollToTop />
    </>
  );
}
