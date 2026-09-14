import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Categories from nongkatistore.com
const CATEGORIES = [
  { id: '49eb43c1-d2a6-40b8-85a9-49a587c8d73f', name: 'HBO MAX', slug: 'hbo-max', icon: '🎬' },
  { id: 'a9bccd55-ac69-4526-8ba0-7f81bec39726', name: 'iQIYI', slug: 'iqiyi', icon: '🎥' },
  { id: '4b7c9fe6-f48b-47c1-af91-1dee54082c04', name: 'WeTV', slug: 'wetv', icon: '📺' },
  { id: 'b0bc0abc-42ff-461f-bd5d-aed7aeafa491', name: 'Youku', slug: 'youku', icon: '🎬' },
  { id: '0532a3e9-ad05-4053-a333-ad6986cdd5f7', name: 'Prime Video', slug: 'prime-video', icon: '📹' },
  { id: 'ccee2370-5ea2-4445-9eb1-5ec72d9565e6', name: 'ONED', slug: 'oned', icon: '📺' },
  { id: '8c9d3591-a7f9-4331-a3d9-05b68b07a512', name: 'Monomax', slug: 'monomax', icon: '🎬' },
  { id: 'e90c15fe-094e-4db2-a486-826d06f14f13', name: 'Bilibili', slug: 'bilibili', icon: '🎵' },
  { id: 'cba6b17c-3767-47da-b4f1-32d5163980d2', name: 'Spotify', slug: 'spotify', icon: '🎵' },
  { id: 'a87af36c-dd3c-4794-b08d-bd8de022908d', name: 'YouTube Premium', slug: 'youtube-premium', icon: '▶️' },
  { id: 'b9332e32-7159-4533-b571-8ef184ee2514', name: 'Microsoft 365', slug: 'microsoft-365', icon: '💻' },
  { id: '6005623a-f8d8-49d1-8444-5941e48fbe63', name: 'CapCut', slug: 'capcut', icon: '✂️' },
  { id: 'a93c51db-26de-4d25-bf47-6781e10e6976', name: 'Netflix', slug: 'netflix', icon: '📺' },
];

// All 38 products from nongkatistore.com (images self-hosted in /public/products)
const PRODUCTS = [
  { name: 'HBO Max 7 4K (÷)4', slug: 'hbo-max-7-4k-4', categoryId: '49eb43c1-d2a6-40b8-85a9-49a587c8d73f', price: 25, stock: 3, description: 'HBO Max 4K 7 วัน แชร์ 4 คน', imageUrl: '/products/1785155699805-7532037ae22f3c16.png' },
  { name: 'HBO Max 30 HD (÷)4', slug: 'hbo-max-30-hd-4', categoryId: '49eb43c1-d2a6-40b8-85a9-49a587c8d73f', price: 40, stock: 0, description: 'HBO Max HD 30 วัน แชร์ 4 คน', imageUrl: '/products/1785155728811-c1b596b52aac75f8.png' },
  { name: 'HBO Max 30 HD (÷)2', slug: 'hbo-max-30-hd-2', categoryId: '49eb43c1-d2a6-40b8-85a9-49a587c8d73f', price: 80, stock: 0, description: 'HBO Max HD 30 วัน แชร์ 2 คน', imageUrl: '/products/1785155781474-48dd041a484c8828.png' },
  { name: 'HBO Max 30 4K (÷)4', slug: 'hbo-max-30-4k-4', categoryId: '49eb43c1-d2a6-40b8-85a9-49a587c8d73f', price: 80, stock: 0, description: 'HBO Max 4K 30 วัน แชร์ 4 คน', imageUrl: '/products/1785155654437-ce41d0f12f6c93f1.png' },
  { name: 'Netflix 30DAY แบบจอ', slug: 'netflix-30day', categoryId: 'a93c51db-26de-4d25-bf47-6781e10e6976', price: 120, stock: 0, description: 'Netflix 30 วัน แบบจอส่วนตัว', imageUrl: '/products/1785152763307-3ba86912dea6f1e1.png' },
  { name: 'Spotify ร้าน', slug: 'spotify-ran', categoryId: 'cba6b17c-3767-47da-b4f1-32d5163980d2', price: 45, stock: 0, description: 'Spotify Premium 30 วัน (เมลร้าน)', imageUrl: '/products/1785208417668-da5080dd22b25f19.png' },
  { name: 'Spotify ลค', slug: 'spotify-lk', categoryId: 'cba6b17c-3767-47da-b4f1-32d5163980d2', price: 40, stock: 0, description: 'Spotify Premium 30 วัน (เมลลค)', imageUrl: '/products/1785208333069-320c08b1c1db7109.png' },
  { name: 'YouTube Premium เมลร้าน', slug: 'youtube-premium-ran', categoryId: 'a87af36c-dd3c-4794-b08d-bd8de022908d', price: 25, stock: 0, description: 'YouTube Premium 30 วัน (เมลร้าน)', imageUrl: '/products/1785154730970-4353bef34fcdbe5a.png' },
  { name: 'YouTube Premium เมลลค', slug: 'youtube-premium-lk', categoryId: 'a87af36c-dd3c-4794-b08d-bd8de022908d', price: 7, stock: 0, description: 'YouTube Premium 30 วัน (เมลลค)', imageUrl: '/products/1785154689936-0c694c981993176c.png' },
  { name: 'WeTV 30 ส่วนตัว', slug: 'wetv-30-private', categoryId: '4b7c9fe6-f48b-47c1-af91-1dee54082c04', price: 85, stock: 0, description: 'WeTV VIP 30 วัน ยกแอค', imageUrl: '/products/1785155387764-c4e488f79e991c2b.png' },
  { name: 'WeTV 30 (÷)2', slug: 'wetv-30-2', categoryId: '4b7c9fe6-f48b-47c1-af91-1dee54082c04', price: 45, stock: 0, description: 'WeTV VIP 30 วัน แชร์ 2 คน', imageUrl: '/products/1785154967267-c25ab1dc8dc941d3.png' },
  { name: 'WeTV 30 (÷)3', slug: 'wetv-30-3', categoryId: '4b7c9fe6-f48b-47c1-af91-1dee54082c04', price: 32, stock: 0, description: 'WeTV VIP 30 วัน แชร์ 3 คน', imageUrl: '/products/1785155053184-2bd9f49f96690a44.png' },
  { name: 'WeTV 30 (÷)4', slug: 'wetv-30-4', categoryId: '4b7c9fe6-f48b-47c1-af91-1dee54082c04', price: 23, stock: 0, description: 'WeTV VIP 30 วัน แชร์ 4 คน', imageUrl: '/products/1785155153016-2c6fb0c3d8184f05.png' },
  { name: 'iQIYI 30 ส่วนตัว', slug: 'iqiyi-30-private', categoryId: 'a9bccd55-ac69-4526-8ba0-7f81bec39726', price: 62, stock: 0, description: 'iQIYI VIP 30 วัน ยกแอค', imageUrl: '/products/1785208028475-dc8e7a93dc2779ed.png' },
  { name: 'iQIYI 30 (÷)2', slug: 'iqiyi-30-2', categoryId: 'a9bccd55-ac69-4526-8ba0-7f81bec39726', price: 32, stock: 0, description: 'iQIYI VIP 30 วัน แชร์ 2 คน', imageUrl: '/products/1785207777497-093c0ad40b0b8592.png' },
  { name: 'iQIYI 30 (÷)3', slug: 'iqiyi-30-3', categoryId: 'a9bccd55-ac69-4526-8ba0-7f81bec39726', price: 22, stock: 0, description: 'iQIYI VIP 30 วัน แชร์ 3 คน', imageUrl: '/products/1785207851015-bfdbf9edd59b712f.png' },
  { name: 'iQIYI 30 (÷)4', slug: 'iqiyi-30-4', categoryId: 'a9bccd55-ac69-4526-8ba0-7f81bec39726', price: 16, stock: 0, description: 'iQIYI VIP 30 วัน แชร์ 4 คน', imageUrl: '/products/1785207936676-8ef3d48d73717c4f.png' },
  { name: 'iQIYI 4K (÷)4', slug: 'iqiyi-4k-4', categoryId: 'a9bccd55-ac69-4526-8ba0-7f81bec39726', price: 25, stock: 0, description: 'iQIYI 4K 30 วัน แชร์ 4 คน', imageUrl: '/products/1785735173445-1af8fc605589135f.png' },
  { name: 'Prime Video 30 (÷)3 ไม่ชน', slug: 'prime-30-3', categoryId: '0532a3e9-ad05-4053-a333-ad6986cdd5f7', price: 40, stock: 0, description: 'Prime Video 30 วัน แชร์ 3 คน ไม่ชน', imageUrl: '/products/1785208653409-eb5d41021b5c178d.png' },
  { name: 'Prime Video 30 (÷)4 ชน', slug: 'prime-30-4', categoryId: '0532a3e9-ad05-4053-a333-ad6986cdd5f7', price: 30, stock: 0, description: 'Prime Video 30 วัน แชร์ 4 คน ชน', imageUrl: '/products/1785208686153-538bf52039eaecb1.png' },
  { name: 'Prime Video 30 (÷)5 ชน', slug: 'prime-30-5', categoryId: '0532a3e9-ad05-4053-a333-ad6986cdd5f7', price: 25, stock: 0, description: 'Prime Video 30 วัน แชร์ 5 คน ชน', imageUrl: '/products/1785208744000-136faeea5bdc43ee.png' },
  { name: 'Prime Video 7 (÷)3 ไม่ชน', slug: 'prime-7-3', categoryId: '0532a3e9-ad05-4053-a333-ad6986cdd5f7', price: 15, stock: 0, description: 'Prime Video 7 วัน แชร์ 3 คน ไม่ชน', imageUrl: '/products/1785208471371-f32b219d30d7deec.png' },
  { name: 'Prime Video 7 (÷)4 ชน', slug: 'prime-7-4', categoryId: '0532a3e9-ad05-4053-a333-ad6986cdd5f7', price: 10, stock: 0, description: 'Prime Video 7 วัน แชร์ 4 คน ชน', imageUrl: '/products/1785208550788-b764333f67190cf8.png' },
  { name: 'Prime Video 7 (÷)5 ชน', slug: 'prime-7-5', categoryId: '0532a3e9-ad05-4053-a333-ad6986cdd5f7', price: 9, stock: 0, description: 'Prime Video 7 วัน แชร์ 5 คน ชน', imageUrl: '/products/1785208594099-70740e1ca9c5854d.png' },
  { name: 'Youku 30 ยกแอค', slug: 'youku-30-private', categoryId: 'b0bc0abc-42ff-461f-bd5d-aed7aeafa491', price: 60, stock: 0, description: 'Youku VIP 30 วัน ยกแอค', imageUrl: '/products/1785154897510-9641f7923f90fb47.png' },
  { name: 'Youku 30 (÷)2', slug: 'youku-30-2', categoryId: 'b0bc0abc-42ff-461f-bd5d-aed7aeafa491', price: 30, stock: 0, description: 'Youku VIP 30 วัน แชร์ 2 คน', imageUrl: '/products/1785154764529-216600e28a728128.png' },
  { name: 'Youku 30 (÷)3', slug: 'youku-30-3', categoryId: 'b0bc0abc-42ff-461f-bd5d-aed7aeafa491', price: 20, stock: 0, description: 'Youku VIP 30 วัน แชร์ 3 คน', imageUrl: '/products/1785154794416-3b72b5c47bfa3206.png' },
  { name: 'Youku 30 (÷)4', slug: 'youku-30-4', categoryId: 'b0bc0abc-42ff-461f-bd5d-aed7aeafa491', price: 15, stock: 0, description: 'Youku VIP 30 วัน แชร์ 4 คน', imageUrl: '/products/1785154836030-254463e8eb45e60c.png' },
  { name: 'ONED 30 ส่วนตัว', slug: 'oned-30-private', categoryId: 'ccee2370-5ea2-4445-9eb1-5ec72d9565e6', price: 120, stock: 0, description: 'ONED 30 วัน ยกแอค', imageUrl: '/products/1785208857348-c46c7a8dd03a9e7b.png' },
  { name: 'ONED 30 (÷)2 ไม่ชน', slug: 'oned-30-2', categoryId: 'ccee2370-5ea2-4445-9eb1-5ec72d9565e6', price: 65, stock: 0, description: 'ONED 30 วัน แชร์ 2 คน ไม่ชน', imageUrl: '/products/1785208815027-acb561527d252bc3.png' },
  { name: 'ONED 30 (÷)3 ชน', slug: 'oned-30-3', categoryId: 'ccee2370-5ea2-4445-9eb1-5ec72d9565e6', price: 45, stock: 0, description: 'ONED 30 วัน แชร์ 3 คน ชน', imageUrl: '/products/1785208898038-012a3323cffa9310.png' },
  { name: 'Monomax 30 จอส่วนตัว (÷)4', slug: 'monomax-30-4', categoryId: '8c9d3591-a7f9-4331-a3d9-05b68b07a512', price: 45, stock: 0, description: 'Monomax 30 วัน จอส่วนตัว แชร์ 4 คน', imageUrl: '/products/1785155845934-c6e2c70efe3723ee.png' },
  { name: 'Bilibili 30 (÷)4', slug: 'bilibili-30-4', categoryId: 'e90c15fe-094e-4db2-a486-826d06f14f13', price: 20, stock: 0, description: 'Bilibili 30 วัน แชร์ 4 คน', imageUrl: '/products/1785741668263-c9cf3a055f3c8a4f.png' },
  { name: 'Microsoft 365 เมลร้าน', slug: 'microsoft-365-ran', categoryId: 'b9332e32-7159-4533-b571-8ef184ee2514', price: 25, stock: 0, description: 'Microsoft 365 (เมลร้าน)', imageUrl: '/products/1785155530866-4477af0f7171b203.png' },
  { name: 'Microsoft 365 เมลลค', slug: 'microsoft-365-lk', categoryId: 'b9332e32-7159-4533-b571-8ef184ee2514', price: 18, stock: 0, description: 'Microsoft 365 (เมลลค)', imageUrl: '/products/1785155482414-d4487554faca5aba.png' },
  { name: 'CapCut 30 จอส่วนตัว', slug: 'capcut-30', categoryId: '6005623a-f8d8-49d1-8444-5941e48fbe63', price: 139, stock: 0, description: 'CapCut Pro 30 วัน จอส่วนตัว', imageUrl: '/products/1785207564451-5770f64bbdbf36e0.png' },
  { name: 'CapCut 7 ส่วนตัว', slug: 'capcut-7', categoryId: '6005623a-f8d8-49d1-8444-5941e48fbe63', price: 59, stock: 0, description: 'CapCut Pro 7 วัน จอส่วนตัว', imageUrl: '/products/1785207666579-6dbfd9af4ee6ea98.png' },
];

async function main() {
  console.log('Clearing existing products...');
  await prisma.productVariant.deleteMany();
  await prisma.product.deleteMany();
  await prisma.category.deleteMany();

  console.log('Creating categories...');
  for (const cat of CATEGORIES) {
    await prisma.category.create({
      data: {
        id: cat.id,
        name: cat.name,
        slug: cat.slug,
        icon: cat.icon,
      },
    });
    console.log('  ' + cat.name);
  }

  console.log('Creating products...');
  for (const prod of PRODUCTS) {
    await prisma.product.create({
      data: {
        name: prod.name,
        slug: prod.slug,
        description: prod.description,
        shortDescription: prod.description,
        imageUrl: prod.imageUrl,
        categoryId: prod.categoryId,
        isFeatured: prod.stock > 0,
        variants: {
          create: {
            label: 'default',
            price: prod.price,
            stock: prod.stock,
          },
        },
      },
    });
    console.log('  ' + prod.name + ' - ฿' + prod.price);
  }

  const cats = await prisma.category.count();
  const prods = await prisma.product.count();
  const vars = await prisma.productVariant.count();
  const withImg = await prisma.product.count({ where: { imageUrl: { not: null } } });
  console.log('Summary: ' + cats + ' categories, ' + prods + ' products (' + withImg + ' with image), ' + vars + ' variants');
}

main()
  .catch((e) => { console.error('Error:', e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
