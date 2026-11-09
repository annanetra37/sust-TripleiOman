require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');

const adapter = new PrismaPg(process.env.DATABASE_URL);
const prisma = new PrismaClient({ adapter });

async function seed() {
  console.log('Seeding activity categories...');

  const categories = [
    {
      name: 'Stationary Combustion',
      subcategories: [
        { name: 'Natural Gas', scope: 'Scope 1', unit: 'kWh', emissionFactor: 0.184, emissionSource: 'Boilers/Furnaces' },
        { name: 'Diesel', scope: 'Scope 1', unit: 'litres', emissionFactor: 2.68, emissionSource: 'Generators' },
        { name: 'LPG', scope: 'Scope 1', unit: 'litres', emissionFactor: 1.56, emissionSource: 'Heating' },
      ],
    },
    {
      name: 'Mobile Combustion',
      subcategories: [
        { name: 'Petrol (Company Cars)', scope: 'Scope 1', unit: 'litres', emissionFactor: 2.31, emissionSource: 'Fleet Vehicles' },
        { name: 'Diesel (Company Cars)', scope: 'Scope 1', unit: 'litres', emissionFactor: 2.68, emissionSource: 'Fleet Vehicles' },
      ],
    },
    {
      name: 'Purchased Electricity',
      subcategories: [
        { name: 'Grid Electricity', scope: 'Scope 2', unit: 'kWh', emissionFactor: 0.233, emissionSource: 'Grid' },
        { name: 'Renewable Electricity', scope: 'Scope 2', unit: 'kWh', emissionFactor: 0, emissionSource: 'Renewables' },
      ],
    },
    {
      name: 'Business Travel',
      subcategories: [
        { name: 'Short-haul Flights', scope: 'Scope 3', unit: 'km', emissionFactor: 0.156, emissionSource: 'Air Travel' },
        { name: 'Long-haul Flights', scope: 'Scope 3', unit: 'km', emissionFactor: 0.195, emissionSource: 'Air Travel' },
        { name: 'Rail', scope: 'Scope 3', unit: 'km', emissionFactor: 0.037, emissionSource: 'Rail Travel' },
        { name: 'Hotel Stays', scope: 'Scope 3', unit: 'nights', emissionFactor: 20.6, emissionSource: 'Accommodation' },
      ],
    },
    {
      name: 'Employee Commuting',
      subcategories: [
        { name: 'Car (Average)', scope: 'Scope 3', unit: 'km', emissionFactor: 0.171, emissionSource: 'Commuting' },
        { name: 'Public Transport', scope: 'Scope 3', unit: 'km', emissionFactor: 0.089, emissionSource: 'Commuting' },
      ],
    },
    {
      name: 'Purchased Goods & Services',
      subcategories: [
        { name: 'Office Supplies', scope: 'Scope 3', unit: 'USD', emissionFactor: 0.001, emissionSource: 'Procurement' },
        { name: 'IT Equipment', scope: 'Scope 3', unit: 'USD', emissionFactor: 0.002, emissionSource: 'Procurement' },
      ],
    },
    {
      name: 'Waste Generated',
      subcategories: [
        { name: 'Landfill Waste', scope: 'Scope 3', unit: 'tonnes', emissionFactor: 467, emissionSource: 'Waste' },
        { name: 'Recycled Waste', scope: 'Scope 3', unit: 'tonnes', emissionFactor: 21.3, emissionSource: 'Waste' },
      ],
    },
  ];

  for (const cat of categories) {
    const created = await prisma.activityCategory.upsert({
      where: { name: cat.name },
      update: {},
      create: { name: cat.name },
    });

    for (const sub of cat.subcategories) {
      await prisma.activitySubcategory.upsert({
        where: { name_categoryId: { name: sub.name, categoryId: created.id } },
        update: { scope: sub.scope, unit: sub.unit, emissionFactor: sub.emissionFactor, emissionSource: sub.emissionSource },
        create: { name: sub.name, categoryId: created.id, scope: sub.scope, unit: sub.unit, emissionFactor: sub.emissionFactor, emissionSource: sub.emissionSource },
      });
    }
  }

  console.log('Seed complete!');
}

seed().catch(console.error).finally(() => prisma.$disconnect());
