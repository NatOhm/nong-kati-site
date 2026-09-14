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

// All 38 products from nongkatistore.com
const PRODUCTS = [
  { name: 'HBO Max 7 4K (÷)4', slug: 'hbo-max-7-4k-4', categoryId: '49eb43c1-d2a6-40b8-85a9-49a587c8d73f', price: 25, stock: 3, description: 'HBO Max 4K 7 วัน แชร์ 4 คน' },
  { name: 'HBO Max 30 HD (÷)4', slug: 'hbo-max-30-hd-4', categoryId: '49eb43c1-d2a6-40b8-85a9-49a587c8d73f', price: 40, stock: 0, description: 'HBO Max HD 30 วัน แชร์ 4 คน' },
  { name: 'HBO Max 30 HD (÷)2', slug: 'hbo-max-30-hd-2', categoryId: '49eb43c1-d2a6-40b8-85a9-49a587c8d73f', price: 80, stock: 0, description: 'HBO Max HD 30 วัน แชร์ 2 คน' },
  { name: 'HBO Max 30 4K (÷)4', slug: 'hbo-max-30-4k-4', categoryId: '49eb43c1-d2a6-40b8-85a9-49a587c8d73f', price: 80, stock: 0, description: 'HBO Max 4K 30 วัน แชร์ 4 คน' },
  { name: 'Netflix 30DAY แบบจอ', slug: 'netflix-30day', categoryId: 'a93c51db-26de-4d25-bf47-6781e10e6976', price: 120, stock: 0, description: 'Netflix 30 วัน แบบจอส่วนตัว' },
  { name: 'Spotify ร้าน', slug: 'spotify-ran', categoryId: 'cba6b17c-3767-47da-b4f1-32d5163980d2', price: 45, stock: 0, description: 'Spotify Premium 30 วัน (เมลร้าน)' },
  { name: 'Spotify ลค', slug: 'spotify-lk', categoryId: 'cba6b17c-3767-47da-b4f1-32d5163980d2', price: 40, stock: 0, description: 'Spotify Premium 30 วัน (เมลลค)' },
  { name: 'YouTube Premium เมลร้าน', slug: 'youtube-premium-ran', categoryId: 'a87af36c-dd3c-4794-b08d-bd8de022908d', price: 25, stock: 0, description: 'YouTube Premium 30 วัน (เมลร้าน)' },
  { name: 'YouTube Premium เมลลค', slug: 'youtube-premium-lk', categoryId: 'a87af36c-dd3c-4794-b08d-bd8de022908d', price: 7, stock: 0, description: 'YouTube Premium 30 วัน (เมลลค)' },
  { name: 'WeTV 30 ส่วนตัว', slug: 'wetv-30-private', categoryId: '4b7c9fe6-f48b-47c1-af91-1dee54082c04', price: 85, stock: 0, description: 'WeTV VIP 30 วัน ยกแอค' },
  { name: 'WeTV 30 (÷)2', slug: 'wetv-30-2', categoryId: '4b7c9fe6-f48b-47c1-af91-1dee54082c04', price: 45, stock: 0, description: 'WeTV VIP 30 วัน แชร์ 2 คน' },
  { name: 'WeTV 30 (÷)3', slug: 'wetv-30-3', categoryId: '4b7c9fe6-f48b-47c1-af91-1dee54082c04', price: 32, stock: 0, description: 'WeTV VIP 30 วัน แชร์ 3 คน' },
  { name: 'WeTV 30 (÷)4', slug: 'wetv-30-4', categoryId: '4b7c9fe6-f48b-47c1-af91-1dee54082c04', price: 23, stock: 0, description: 'WeTV VIP 30 วัน แชร์ 4 คน' },
  { name: 'iQIYI 30 ส่วนตัว', slug: 'iqiyi-30-private', categoryId: 'a9bccd55-ac69-4526-8ba0-7f81bec39726', price: 62, stock: 0, description: 'iQIYI VIP 30 วัน ยกแอค' },
  { name: 'iQIYI 30 (÷)2', slug: 'iqiyi-30-2', categoryId: 'a9bccd55-ac69-4526-8ba0-7f81bec39726', price: 32, stock: 0, description: 'iQIYI VIP 30 วัน แชร์ 2 คน' },
  { name: 'iQIYI 30 (÷)3', slug: 'iqiyi-30-3', categoryId: 'a9bccd55-ac69-4526-8ba0-7f81bec39726', price: 22, stock: 0, description: 'iQIYI VIP 30 วัน แชร์ 3 คน' },
  { name: 'iQIYI 30 (÷)4', slug: 'iqiyi-30-4', categoryId: 'a9bccd55-ac69-4526-8ba0-7f81bec39726', price: 16, stock: 0, description: 'iQIYI VIP 30 วัน แชร์ 4 คน' },
  { name: 'iQIYI 4K (÷)4', slug: 'iqiyi-4k-4', categoryId: 'a9bccd55-ac69-4526-8ba0-7f81bec39726', price: 25, stock: 0, description: 'iQIYI 4K 30 วัน แชร์ 4 คน' },
  { name: 'Prime Video 30 (÷)3 ไม่ชน', slug: 'prime-30-3', categoryId: '0532a3e9-ad05-4053-a333-ad6986cdd5f7', price: 40, stock: 0, description: 'Prime Video 30 วัน แชร์ 3 คน ไม่ชน' },
  { name: 'Prime Video 30 (÷)4 ชน', slug: 'prime-30-4', categoryId: '0532a3e9-ad05-4053-a333-ad6986cdd5f7', price: 30, stock: 0, description: 'Prime Video 30 วัน แชร์ 4 คน ชน' },
  { name: 'Prime Video 30 (÷)5 ชน', slug: 'prime-30-5', categoryId: '0532a3e9-ad05-4053-a333-ad6986cdd5f7', price: 25, stock: 0, description: 'Prime Video 30 วัน แชร์ 5 คน ชน' },
  { name: 'Prime Video 7 (÷)3 ไม่ชน', slug: 'prime-7-3', categoryId: '0532a3e9-ad05-4053-a333-ad6986cdd5f7', price: 15, stock: 0, description: 'Prime Video 7 วัน แชร์ 3 คน ไม่ชน' },
  { name: 'Prime Video 7 (÷)4 ชน', slug: 'prime-7-4', categoryId: '0532a3e9-ad05-4053-a333-ad6986cdd5f7', price: 10, stock: 0, description: 'Prime Video 7 วัน แชร์ 4 คน ชน' },
  { name: 'Prime Video 7 (÷)5 ชน', slug: 'prime-7-5', categoryId: '0532a3e9-ad05-4053-a333-ad6986cdd5f7', price: 9, stock: 0, description: 'Prime Video 7 วัน แชร์ 5 คน ชน' },
  { name: 'Youku 30 ยกแอค', slug: 'youku-30-private', categoryId: 'b0bc0abc-42ff-461f-bd5d-aed7aeafa491', price: 60, stock: 0, description: 'Youku VIP 30 วัน ยกแอค' },
  { name: 'Youku 30 (÷)2', slug: 'youku-30-2', categoryId: 'b0bc0abc-42ff-461f-bd5d-aed7aeafa491', price: 30, stock: 0, description: 'Youku VIP 30 วัน แชร์ 2 คน' },
  { name: 'Youku 30 (÷)3', slug: 'youku-30-3', categoryId: 'b0bc0abc-42ff-461f-bd5d-aed7aeafa491', price: 20, stock: 0, description: 'Youku VIP 30 วัน แชร์ 3 คน' },
  { name: 'Youku 30 (÷)4', slug: 'youku-30-4', categoryId: 'b0bc0abc-42ff-461f-bd5d-aed7aeafa491', price: 15, stock: 0, description: 'Youku VIP 30 วัน แชร์ 4 คน' },
  { name: 'ONED 30 ส่วนตัว', slug: 'oned-30-private', categoryId: 'ccee2370-5ea2-4445-9eb1-5ec72d9565e6', price: 120, stock: 0, description: 'ONED 30 วัน ยกแอค' },
  { name: 'ONED 30 (÷)2 ไม่ชน', slug: 'oned-30-2', categoryId: 'ccee2370-5ea2-4445-9eb1-5ec72d9565e6', price: 65, stock: 0, description: 'ONED 30 วัน แชร์ 2 คน ไม่ชน' },
  { name: 'ONED 30 (÷)3 ชน', slug: 'oned-30-3', categoryId: 'ccee2370-5ea2-4445-9eb1-5ec72d9565e6', price: 45, stock: 0, description: 'ONED 30 วัน แชร์ 3 คน ชน' },
  { name: 'Monomax 30 จอส่วนตัว (÷)4', slug: 'monomax-30-4', categoryId: '8c9d3591-a7f9-4331-a3d9-05b68b07a512', price: 45, stock: 0, description: 'Monomax 30 วัน จอส่วนตัว แชร์ 4 คน' },
  { name: 'Bilibili 30 (÷)4', slug: 'bilibili-30-4', categoryId: 'e90c15fe-094e-4db2-a486-826d06f14f13', price: 20, stock: 0, description: 'Bilibili 30 วัน แชร์ 4 คน' },
  { name: 'Microsoft 365 เมลร้าน', slug: 'microsoft-365-ran', categoryId: 'b9332e32-7159-4533-b571-8ef184ee2514', price: 25, stock: 0, description: 'Microsoft 365 (เมลร้าน)' },
  { name: 'Microsoft 365 เมลลค', slug: 'microsoft-365-lk', categoryId: 'b9332e32-7159-4533-b571-8ef184ee2514', price: 18, stock: 0, description: 'Microsoft 365 (เมลลค)' },
  { name: 'CapCut 30 จอส่วนตัว', slug: 'capcut-30', categoryId: '6005623a-f8d8-49d1-8444-5941e48fbe63', price: 139, stock: 0, description: 'CapCut Pro 30 วัน จอส่วนตัว' },
  { name: 'CapCut 7 ส่วนตัว', slug: 'capcut-7', categoryId: '6005623a-f8d8-49d1-8444-5941e48fbe63', price: 59, stock: 0, description: 'CapCut Pro 7 วัน จอส่วนตัว' },
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
  console.log('Summary: ' + cats + ' categories, ' + prods + ' products, ' + vars + ' variants');
}

main()
  .catch((e) => { console.error('Error:', e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
