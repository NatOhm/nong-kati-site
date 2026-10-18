import { Metadata } from 'next';
import Link from 'next/link';

import { FacebookLayout } from '@/components/layout/FacebookLayout';
import { Footer } from '@/components/layout/Footer';

export const dynamic = 'force-dynamic';
import { ProductCard } from '@/components/product/ProductCard';
import { AppTile } from '@/components/product/AppTile';
import { ProductGrid } from '@/components/product/ProductGrid';
import { StructuredData } from '@/components/data-display/StructuredData';

// New components
import { HeroCarousel } from '@/components/home/HeroCarousel';
import { StatsCounter } from '@/components/home/StatsCounter';
import { TrustBadges } from '@/components/home/TrustBadges';
import { FAQAccordion } from '@/components/home/FAQAccordion';
import { LINEChatButton } from '@/components/home/LINEChatButton';
import { ScrollToTop } from '@/components/home/ScrollToTop';
import { ScrollReveal } from '@/components/home/ScrollReveal';
import { PawDivider } from '@/components/ui/PawDivider';
import { SiteMascot } from '@/components/ui/SiteMascot';
import { HamsterCelebrating, HamsterFace, HamsterWorried } from '@/components/ui/ClayIcons';

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
import { splitAppGroups } from '@/lib/appGroups';
import { publicOrigin } from '@/lib/siteConfig';

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
  let categories: Awaited<ReturnType<typeof getCategoriesWithProductCounts>> = [];
  let featuredProducts: Awaited<ReturnType<typeof getFeaturedProducts>> = [];
  let heroSlides: Awaited<ReturnType<typeof getHeroSlides>> = [];
  let stats: Awaited<ReturnType<typeof getStorefrontStats>> | null = null;
  let faqSettings: Awaited<ReturnType<typeof getFaqSettings>> = {
    enabled: true,
    items: [],
  };
  let trustBadges = DEFAULT_TRUST_BADGES;
  let dbDown = false;
  try {
    categories = await getCategoriesWithProductCounts();
    featuredProducts = await getFeaturedProducts();
    heroSlides = await getHeroSlides();
    stats = await getStorefrontStats();
    faqSettings = await getFaqSettings();
    trustBadges = await getTrustBadgesSettings();
  } catch (e) {
    dbDown = true;
    console.error(
      '[HomePage] Database unavailable, rendering degraded state:',
      e instanceof Error ? e.message : e,
    );
  }

  // Main groups keep their sub-apps instead of being flattened away. The old
  // flatMap dissolved every group into the grid, so staff could configure a
  // main group (แอปดูหนัง/ซีรีส์) with children (weTV, Bilibili…) and customers
  // would never see one — the grouping existed only in the database.
  const { groups: appGroups, looseApps } = splitAppGroups(categories);

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

        {/* Announcement board — the headline framed as a notice board (client ask).
            Audit #9: tightened vertical rhythm on mobile so the category/app
            grid enters the first viewport (pt-8→pt-4, py-5→py-3 on mobile). */}
        <section className="px-4 pt-4 md:px-8 md:pt-8">
          <div className="mx-auto max-w-3xl rounded-2xl border-2 border-dashed border-peach-300 bg-peach-50 px-4 py-3 text-center shadow-clay-sm sm:px-6 sm:py-5 dark:border-peach-700/60 dark:bg-peach-900/20">
            {/* Hamster mascot waving at the headline — the site mascot, so an
                admin-uploaded mascot replaces it here as well as in the logo. */}
            <SiteMascot
              size={84}
              className="mascot-wave mx-auto mb-1 block w-fit drop-shadow-[0_3px_5px_rgba(147,107,73,0.28)]"
            />
            {/* Site-wide h1 (landmark spec): the notice-board headline is the
                page's main heading — p→h1 keeps the identical clay styling. */}
            <h1 className="font-display text-xl font-bold leading-snug text-fg-brand-strong sm:text-2xl">
              แอคดูหนัง ซีรีส์ ส่งถึงอีเมลหลังยืนยันการชำระเงิน
            </h1>
            {/* clay-700 lands exactly 4.50 on the peach-50 card — use clay-800
                for headroom (7.11). Dark keeps the muted token. */}
            <p className="mt-1.5 text-sm text-clay-800 dark:text-fg-muted">
              โอนเงินแล้วอัปโหลดสลิป ทีมงานยืนยันและส่งโค้ดให้ทันที
            </p>
            <Link
              href="/search"
              className="transition-smart mt-4 inline-flex items-center justify-center rounded-full bg-peach-500 px-8 py-2.5 text-sm font-semibold text-white shadow-clay-brand hover:bg-peach-400 hover:shadow-clay-lg active:scale-95 active:shadow-clay-press"
            >
              เลือกซื้อสินค้า
            </Link>
          </div>
        </section>

        {/* How It Works — วิธีการซื้อ moved to the very top (client ask).
            Audit #9: compact single-row cards on mobile (~100px total),
            full three-column grid from sm up. */}
        <ScrollReveal>
          <section className="px-4 py-4 md:px-8 md:py-8">
            <h2 className="mb-3 text-center text-base font-bold text-fg sm:mb-6 sm:text-lg">
              วิธีการซื้อ
            </h2>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 sm:gap-4">
              {[
                {
                  step: '01',
                  title: 'เลือกสินค้า',
                  desc: 'เลือกประเภทบัตรและราคาที่ต้องการ',
                  // Sniffing around the shelves = browsing.
                  art: <HamsterFace size={44} className="mascot-sniff" />,
                },
                {
                  step: '02',
                  title: 'ชำระเงิน',
                  desc: 'โอนเงินแล้วส่งสลิปยืนยัน',
                  // Anxious waiting while the slip is checked — on-brand, and it
                  // sets up the payoff on step 03.
                  art: <HamsterWorried size={44} className="mascot-beg" />,
                },
                {
                  step: '03',
                  title: 'รับโค้ด',
                  desc: 'รับโค้ดหลังยืนยันการชำระเงิน',
                  // Code delivered.
                  art: <HamsterCelebrating size={44} className="mascot-celebrate" />,
                },
              ].map((item) => (
                <div
                  key={item.step}
                  className="clay-card flex items-center gap-4 rounded-xl p-4 transition-transform duration-fast ease-out-quart hover:-translate-y-0.5"
                >
                  <span className="text-2xl font-bold text-peach-700 dark:text-peach-200">
                    {item.step}
                  </span>
                  <div className="min-w-0 flex-1">
                    <h3 className="text-sm font-semibold text-fg">{item.title}</h3>
                    <p className="text-xs text-fg-muted">{item.desc}</p>
                  </div>
                  <span className="shrink-0">{item.art}</span>
                </div>
              ))}
            </div>
          </section>
        </ScrollReveal>

        {/* Data-outage alert (audit round 2 #4): during a DB outage the
            catalogue region must not silently render as an empty shop — an
            explicit recoverable alert replaces it. Server-rendered anchors
            only (no client handlers in this tree). */}
        {dbDown && (
          <section role="alert" className="px-4 pb-4 md:px-8">
            {' '}
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

        {/* Categories Section */}

        <PawDivider className="py-4" />

        {/* App-tile grid — dark panel like the client mockup: artwork tiles
            per app, จำนวน pill, single-product apps go straight to the
            package page; multi-product apps open the category */}
        <ScrollReveal>
          <section className="px-4 py-6 md:px-8">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-fg">หมวดหมู่แอปทั้งหมด</h2>
              <Link
                href="/search"
                className="text-sm font-medium text-fg-brand-strong hover:text-fg-brand-strong"
              >
                ดูทั้งหมด
              </Link>
            </div>
            {/* Panel follows the theme like the client's reference: warm cream
                in light mode, the original dark clay panel in dark mode. */}
            <div className="shadow-clay-md rounded-2xl bg-clay-100 p-4 dark:bg-clay-950">
              {appGroups.map((group) => (
                <section key={group.id} className="mb-6 last:mb-0">
                  {/* Main group heading as a glossy full-width pill (client
                      reference): warm gradient bar, folder + name + count chip
                      inside, ดูทั้งหมด kept at the right. Theme-aware — cream /
                      peach in light mode, caramel clay in dark mode, dark text
                      on both so the contrast gate stays green.
                      Underlay = bg-clay-300, a luminance stand-in for the
      gradient's darkest stop (clay-300 ≈ peach-200); the gradient paints
      over it, so users never see the flat color, but the contrast scanner
      (background-color chain only) reads a conservative stand-in instead of
      falling through to the dark panel. Deliberately NOT bg-peach-200: the
      globals legibility patch `[data-theme='dark'] .bg-peach-200
      .text-peach-800` would force the dark-mode link back to peach-800 and
      drop it to 3.13 on the caramel pill. */}
                  <div className="relative mb-3 flex items-center justify-between gap-3 overflow-hidden rounded-full bg-clay-300 bg-gradient-to-r from-peach-100 via-fawn-50 to-peach-200 px-4 py-2.5 shadow-clay-sm ring-1 ring-white/70 dark:bg-clay-500 dark:from-clay-500 dark:via-clay-400 dark:to-clay-500 dark:ring-clay-600/60">
                    {/* Gloss band — the client reference pills are candy-glossy:
                        a bright wash over the top half. Overlay only (no
                        background-color), so the contrast scanner still reads
                        the underlay beneath it. */}
                    <span
                      aria-hidden
                      className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/55 to-transparent"
                    />
                    <h3 className="flex min-w-0 items-center gap-2 text-sm font-bold text-clay-900">
                      <span aria-hidden className="shrink-0 text-base">
                        {group.icon || '📁'}
                      </span>
                      <span className="truncate">{group.name}</span>
                      <span className="shrink-0 rounded-full bg-clay-100/80 px-2 py-0.5 text-xs font-semibold text-clay-800 dark:bg-clay-100">
                        {group.productCount ?? 0} รายการ
                      </span>
                    </h3>
                    <Link
                      href={`/category/${group.slug}`}
                      className="shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold text-peach-800 transition-colors hover:bg-clay-100/70 hover:text-peach-900 dark:text-clay-950 dark:hover:bg-clay-950/10 dark:hover:text-clay-950"
                    >
                      ดูทั้งหมด →
                    </Link>
                  </div>
                  <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8">
                    {group.children.map((cat) => (
                      <AppTile
                        key={cat.id}
                        name={cat.name}
                        slug={cat.slug}
                        icon={cat.icon}
                        imageUrl={cat.imageUrl}
                        productSlug={cat.productSlug}
                        productCount={cat.productCount}
                      />
                    ))}
                  </div>
                </section>
              ))}

              {looseApps.length > 0 && (
                <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8">
                  {looseApps.map((cat) => (
                    <AppTile
                      key={cat.id}
                      name={cat.name}
                      slug={cat.slug}
                      icon={cat.icon}
                      imageUrl={cat.imageUrl}
                      productSlug={cat.productSlug}
                      productCount={cat.productCount}
                    />
                  ))}
                </div>
              )}
            </div>
          </section>
        </ScrollReveal>

        {/* Featured Products Section */}
        {featuredProducts.length > 0 && (
          <ScrollReveal>
            <section className="px-4 py-6 md:px-8">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-lg font-bold text-fg">สินค้าแนะนำ</h2>
                <Link
                  href="/recommended"
                  className="text-sm font-medium text-fg-brand-strong hover:text-fg-brand-strong"
                >
                  ดูทั้งหมด →
                </Link>
              </div>
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
            </section>
          </ScrollReveal>
        )}

        <PawDivider className="py-6" />

        {/* Trust Badges */}
        <ScrollReveal>
          <TrustBadges settings={trustBadges} />
        </ScrollReveal>

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
