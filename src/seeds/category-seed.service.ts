import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

interface ChildCategoryDef {
  name: string;
  es: string;
  pt: string;
}

interface RootCategoryDef {
  name: string;
  type: 'INCOME' | 'EXPENSE';
  icon: string;
  es: string;
  pt: string;
  children?: ChildCategoryDef[];
}

const CATEGORIES: RootCategoryDef[] = [
  // ─── INCOME ──────────────────────────────────────────────────────────────────
  {
    name: 'Wage & Salary',
    type: 'INCOME',
    icon: 'payments',
    es: 'Salario y Nómina',
    pt: 'Salário e Remuneração',
    children: [
      { name: 'Bonus', es: 'Bono', pt: 'Bônus' },
      { name: 'Commission', es: 'Comisión', pt: 'Comissão' },
      {
        name: 'Employer Matching',
        es: 'Aporte del Empleador',
        pt: 'Contribuição do Empregador',
      },
      { name: 'Gross Pay', es: 'Salario Bruto', pt: 'Salário Bruto' },
      { name: 'Net Pay', es: 'Salario Neto', pt: 'Salário Líquido' },
      { name: 'Overtime', es: 'Horas Extra', pt: 'Hora Extra' },
    ],
  },
  {
    name: 'Retirement Income',
    type: 'INCOME',
    icon: 'savings',
    es: 'Ingresos por Jubilación',
    pt: 'Renda de Aposentadoria',
    children: [
      {
        name: 'IRA Distribution',
        es: 'Distribución de IRA',
        pt: 'Distribuição de IRA',
      },
      {
        name: 'Pensions & Annuities',
        es: 'Pensiones y Anualidades',
        pt: 'Pensões e Anuidades',
      },
      {
        name: 'Social Security Benefits',
        es: 'Beneficios de Seguridad Social',
        pt: 'Benefícios da Segurança Social',
      },
    ],
  },
  {
    name: 'Investment Income',
    type: 'INCOME',
    icon: 'trending_up',
    es: 'Ingresos de Inversión',
    pt: 'Renda de Investimento',
    children: [
      {
        name: 'Capital Gains',
        es: 'Ganancias de Capital',
        pt: 'Ganhos de Capital',
      },
      { name: 'Dividends', es: 'Dividendos', pt: 'Dividendos' },
      { name: 'Interest', es: 'Intereses', pt: 'Juros' },
      {
        name: 'Tax-Exempt Interest',
        es: 'Intereses Exentos de Impuestos',
        pt: 'Juros Isentos de Impostos',
      },
    ],
  },
  {
    name: 'Income/Interest',
    type: 'INCOME',
    icon: 'account_balance',
    es: 'Ingresos/Intereses',
    pt: 'Renda/Juros',
  },
  {
    name: 'Other Income',
    type: 'INCOME',
    icon: 'payments',
    es: 'Otros Ingresos',
    pt: 'Outras Rendas',
    children: [
      {
        name: 'Child Support Received',
        es: 'Pensión Alimenticia Recibida',
        pt: 'Pensão Alimentícia Recebida',
      },
      {
        name: 'Employee Stock Option',
        es: 'Opción sobre Acciones del Empleado',
        pt: 'Opção de Ações do Empregado',
      },
      {
        name: 'Gifts Received',
        es: 'Regalos Recibidos',
        pt: 'Presentes Recebidos',
      },
      {
        name: 'Loan Principal Received',
        es: 'Principal de Préstamo Recibido',
        pt: 'Principal de Empréstimo Recebido',
      },
      { name: 'Lotteries', es: 'Loterías', pt: 'Loterias' },
      {
        name: 'State & Local Tax Refund',
        es: 'Reembolso de Impuestos Estatales y Locales',
        pt: 'Reembolso de Impostos Estaduais e Locais',
      },
      {
        name: 'Unemployment Compensation',
        es: 'Compensación por Desempleo',
        pt: 'Compensação por Desemprego',
      },
    ],
  },

  // ─── EXPENSE ─────────────────────────────────────────────────────────────────
  {
    name: 'Automobile',
    type: 'EXPENSE',
    icon: 'directions_car',
    es: 'Automóvil',
    pt: 'Automóvel',
    children: [
      {
        name: 'Car Payment',
        es: 'Pago de Automóvil',
        pt: 'Pagamento de Carro',
      },
      { name: 'Gasoline', es: 'Gasolina', pt: 'Gasolina' },
      { name: 'Maintenance', es: 'Mantenimiento', pt: 'Manutenção' },
    ],
  },
  {
    name: 'Bills',
    type: 'EXPENSE',
    icon: 'receipt_long',
    es: 'Facturas',
    pt: 'Contas',
    children: [
      {
        name: 'Cable/Satellite Television',
        es: 'Televisión por Cable/Satélite',
        pt: 'Televisão a Cabo/Satélite',
      },
      { name: 'Cell Phone', es: 'Teléfono Celular', pt: 'Telefone Celular' },
      { name: 'Cellular', es: 'Celular', pt: 'Celular' },
      { name: 'Electricity', es: 'Electricidad', pt: 'Eletricidade' },
      {
        name: 'Garbage & Recycle',
        es: 'Basura y Reciclaje',
        pt: 'Lixo e Reciclagem',
      },
      { name: 'Health Club', es: 'Gimnasio', pt: 'Academia' },
      {
        name: "Home-owner's Dues",
        es: 'Cuotas de Propietario',
        pt: 'Taxas de Condomínio',
      },
      {
        name: 'Membership Fees',
        es: 'Cuotas de Membresía',
        pt: 'Taxas de Associação',
      },
      {
        name: 'Mortgage Payment',
        es: 'Pago de Hipoteca',
        pt: 'Pagamento de Hipoteca',
      },
      {
        name: 'Natural Gas/Oil',
        es: 'Gas Natural/Petróleo',
        pt: 'Gás Natural/Óleo',
      },
      { name: 'Newspaper', es: 'Periódico', pt: 'Jornal' },
      {
        name: 'On-line/Internet Service',
        es: 'Servicio de Internet',
        pt: 'Serviço de Internet',
      },
      {
        name: 'Other Loan Payment',
        es: 'Otro Pago de Préstamo',
        pt: 'Outro Pagamento de Empréstimo',
      },
      { name: 'Rent', es: 'Alquiler', pt: 'Aluguel' },
      {
        name: 'Student Loan Payment',
        es: 'Pago de Préstamo Estudiantil',
        pt: 'Pagamento de Empréstimo Estudantil',
      },
      { name: 'Telephone', es: 'Teléfono', pt: 'Telefone' },
      {
        name: 'Water & Sewer',
        es: 'Agua y Alcantarillado',
        pt: 'Água e Esgoto',
      },
    ],
  },
  {
    name: 'Bank Charges',
    type: 'EXPENSE',
    icon: 'account_balance',
    es: 'Cargos Bancarios',
    pt: 'Encargos Bancários',
    children: [
      { name: 'Interest Paid', es: 'Intereses Pagados', pt: 'Juros Pagos' },
      {
        name: 'Service charge',
        es: 'Cargo por Servicio',
        pt: 'Tarifa de Serviço',
      },
    ],
  },
  {
    name: 'Cash Withdrawal',
    type: 'EXPENSE',
    icon: 'payments',
    es: 'Retiro de Efectivo',
    pt: 'Saque em Dinheiro',
  },
  {
    name: 'Charitable Donations',
    type: 'EXPENSE',
    icon: 'volunteer_activism',
    es: 'Donaciones Benéficas',
    pt: 'Doações de Caridade',
  },
  {
    name: 'Childcare',
    type: 'EXPENSE',
    icon: 'child_care',
    es: 'Cuidado Infantil',
    pt: 'Cuidados Infantis',
    children: [
      {
        name: 'Child Support',
        es: 'Pensión Alimenticia',
        pt: 'Pensão Alimentícia',
      },
      { name: 'Daycare', es: 'Guardería', pt: 'Creche' },
    ],
  },
  {
    name: 'Children/Toys',
    type: 'EXPENSE',
    icon: 'toys',
    es: 'Niños/Juguetes',
    pt: 'Crianças/Brinquedos',
  },
  {
    name: 'Clothing',
    type: 'EXPENSE',
    icon: 'checkroom',
    es: 'Ropa',
    pt: 'Roupas',
  },
  {
    name: 'Credit Card Payments/Transfers',
    type: 'EXPENSE',
    icon: 'credit_card',
    es: 'Pagos/Transferencias de Tarjeta de Crédito',
    pt: 'Pagamentos/Transferências de Cartão de Crédito',
  },
  {
    name: 'Dining Out',
    type: 'EXPENSE',
    icon: 'restaurant',
    es: 'Comer Afuera',
    pt: 'Jantar Fora',
  },
  {
    name: 'Education',
    type: 'EXPENSE',
    icon: 'school',
    es: 'Educación',
    pt: 'Educação',
    children: [
      { name: 'Books', es: 'Libros', pt: 'Livros' },
      { name: 'Fees', es: 'Tarifas', pt: 'Taxas' },
      { name: 'Tuition', es: 'Matrícula', pt: 'Mensalidade' },
    ],
  },
  {
    name: 'Entertainment',
    type: 'EXPENSE',
    icon: 'movie',
    es: 'Entretenimiento',
    pt: 'Entretenimento',
  },
  {
    name: 'Fees',
    type: 'EXPENSE',
    icon: 'receipt',
    es: 'Tarifas',
    pt: 'Taxas',
  },
  {
    name: 'Food',
    type: 'EXPENSE',
    icon: 'restaurant',
    es: 'Comida',
    pt: 'Comida',
  },
  {
    name: 'Gifts',
    type: 'EXPENSE',
    icon: 'card_giftcard',
    es: 'Regalos',
    pt: 'Presentes',
  },
  {
    name: 'Groceries',
    type: 'EXPENSE',
    icon: 'shopping_cart',
    es: 'Compras',
    pt: 'Supermercado',
  },
  {
    name: 'Health-care',
    type: 'EXPENSE',
    icon: 'health_and_safety',
    es: 'Atención Médica',
    pt: 'Assistência Médica',
    children: [
      { name: 'Dental', es: 'Dental', pt: 'Dentista' },
      {
        name: 'Eye-care',
        es: 'Cuidado de la Vista',
        pt: 'Cuidados com a Visão',
      },
      { name: 'Hospital', es: 'Hospital', pt: 'Hospital' },
      { name: 'Physician', es: 'Médico', pt: 'Médico' },
      { name: 'Prescriptions', es: 'Recetas', pt: 'Receitas' },
    ],
  },
  {
    name: 'Hobbies/Leisure',
    type: 'EXPENSE',
    icon: 'sports_esports',
    es: 'Pasatiempos/Ocio',
    pt: 'Hobbies/Lazer',
    children: [
      {
        name: 'Books & Magazines',
        es: 'Libros y Revistas',
        pt: 'Livros e Revistas',
      },
      {
        name: 'Cultural Events',
        es: 'Eventos Culturales',
        pt: 'Eventos Culturais',
      },
      { name: 'Entertaining', es: 'Entretenimiento', pt: 'Entretenimento' },
      {
        name: 'Movies & Video Rentals',
        es: 'Películas y Alquiler de Videos',
        pt: 'Filmes e Aluguel de Vídeos',
      },
      {
        name: 'Sporting Events',
        es: 'Eventos Deportivos',
        pt: 'Eventos Esportivos',
      },
      {
        name: 'Sporting Goods',
        es: 'Artículos Deportivos',
        pt: 'Artigos Esportivos',
      },
      { name: 'Tapes & CDs', es: 'Cintas y CDs', pt: 'Fitas e CDs' },
      {
        name: 'Toys & Games',
        es: 'Juguetes y Juegos',
        pt: 'Brinquedos e Jogos',
      },
    ],
  },
  {
    name: 'Home Improvement',
    type: 'EXPENSE',
    icon: 'home_repair_service',
    es: 'Mejoras del Hogar',
    pt: 'Melhorias da Casa',
  },
  {
    name: 'Household',
    type: 'EXPENSE',
    icon: 'home',
    es: 'Hogar',
    pt: 'Doméstico',
    children: [
      { name: 'Furnishing', es: 'Muebles', pt: 'Mobiliário' },
      {
        name: 'House Cleaning',
        es: 'Limpieza del Hogar',
        pt: 'Limpeza da Casa',
      },
      {
        name: 'Yard Service',
        es: 'Servicio de Jardín',
        pt: 'Serviço de Jardim',
      },
    ],
  },
  {
    name: 'Insurance',
    type: 'EXPENSE',
    icon: 'shield',
    es: 'Seguro',
    pt: 'Seguro',
    children: [
      { name: 'Automobile', es: 'Automóvil', pt: 'Automóvel' },
      { name: 'Health', es: 'Salud', pt: 'Saúde' },
      {
        name: "Home-owner's/Renter's",
        es: 'Propietario/Inquilino',
        pt: 'Proprietário/Inquilino',
      },
      { name: 'Life', es: 'Vida', pt: 'Vida' },
    ],
  },
  {
    name: 'Job Expense',
    type: 'EXPENSE',
    icon: 'work',
    es: 'Gastos de Trabajo',
    pt: 'Despesas de Trabalho',
    children: [
      { name: 'Non-Reimbursed', es: 'No Reembolsado', pt: 'Não Reembolsado' },
      { name: 'Reimbursed', es: 'Reembolsado', pt: 'Reembolsado' },
    ],
  },
  {
    name: 'Loan',
    type: 'EXPENSE',
    icon: 'account_balance',
    es: 'Préstamo',
    pt: 'Empréstimo',
    children: [
      {
        name: 'Loan Interest',
        es: 'Interés de Préstamo',
        pt: 'Juros de Empréstimo',
      },
      {
        name: 'Mortgage Interest',
        es: 'Interés Hipotecario',
        pt: 'Juros de Hipoteca',
      },
      {
        name: 'Student Loan Interest',
        es: 'Interés de Préstamo Estudiantil',
        pt: 'Juros de Empréstimo Estudantil',
      },
    ],
  },
  {
    name: 'Miscellaneous',
    type: 'EXPENSE',
    icon: 'more_horiz',
    es: 'Misceláneos',
    pt: 'Diversos',
  },
  {
    name: 'Mortgage/Rent',
    type: 'EXPENSE',
    icon: 'home',
    es: 'Hipoteca/Alquiler',
    pt: 'Hipoteca/Aluguel',
  },
  {
    name: 'Personal Care',
    type: 'EXPENSE',
    icon: 'spa',
    es: 'Cuidado Personal',
    pt: 'Cuidados Pessoais',
  },
  {
    name: 'Pet Care',
    type: 'EXPENSE',
    icon: 'pets',
    es: 'Cuidado de Mascotas',
    pt: 'Cuidados com Animais',
    children: [
      { name: 'Food', es: 'Comida', pt: 'Comida' },
      { name: 'Supplies', es: 'Suministros', pt: 'Suprimentos' },
      { name: 'Veterinarian', es: 'Veterinario', pt: 'Veterinário' },
    ],
  },
  {
    name: 'Phone/Wireless',
    type: 'EXPENSE',
    icon: 'smartphone',
    es: 'Teléfono/Inalámbrico',
    pt: 'Telefone/Sem Fio',
  },
  {
    name: 'Services/Memberships',
    type: 'EXPENSE',
    icon: 'handyman',
    es: 'Servicios/Membresías',
    pt: 'Serviços/Assinaturas',
  },
  {
    name: 'Taxes',
    type: 'EXPENSE',
    icon: 'calculate',
    es: 'Impuestos',
    pt: 'Impostos',
    children: [
      {
        name: 'Federal Income Tax',
        es: 'Impuesto Federal sobre la Renta',
        pt: 'Imposto de Renda Federal',
      },
      {
        name: 'Federal Income Tax-Previous Year',
        es: 'Impuesto Federal sobre la Renta-Año Anterior',
        pt: 'Imposto de Renda Federal-Ano Anterior',
      },
      {
        name: 'Local Income Tax',
        es: 'Impuesto Local sobre la Renta',
        pt: 'Imposto de Renda Local',
      },
      { name: 'Medicare tax', es: 'Impuesto Medicare', pt: 'Imposto Medicare' },
      { name: 'Other Taxes', es: 'Otros Impuestos', pt: 'Outros Impostos' },
      {
        name: 'Real Estate Taxes',
        es: 'Impuestos Inmobiliarios',
        pt: 'Impostos Imobiliários',
      },
      {
        name: 'Sales Tax',
        es: 'Impuesto sobre Ventas',
        pt: 'Imposto sobre Vendas',
      },
      {
        name: 'Social Security Tax',
        es: 'Impuesto de Seguridad Social',
        pt: 'Imposto de Segurança Social',
      },
      {
        name: 'State Income Tax',
        es: 'Impuesto Estatal sobre la Renta',
        pt: 'Imposto de Renda Estadual',
      },
      {
        name: 'State/Provincial',
        es: 'Estatal/Provincial',
        pt: 'Estadual/Provincial',
      },
    ],
  },
  {
    name: 'Travel/Vacation',
    type: 'EXPENSE',
    icon: 'flight',
    es: 'Viaje/Vacaciones',
    pt: 'Viagem/Férias',
    children: [
      { name: 'Lodging', es: 'Alojamiento', pt: 'Hospedagem' },
      { name: 'Travel', es: 'Viaje', pt: 'Viagem' },
    ],
  },
  {
    name: 'Utilities',
    type: 'EXPENSE',
    icon: 'bolt',
    es: 'Servicios Públicos',
    pt: 'Utilidades',
  },
];

@Injectable()
export class CategorySeedService {
  private readonly logger = new Logger(CategorySeedService.name);

  constructor(private readonly prisma: PrismaService) {}

  async seedCategories(): Promise<number> {
    const count = await this.prisma.category.count();
    if (count > 0) {
      this.logger.log('Category seed skipped: table already contains data');
      return 0;
    }

    const now = new Date();
    let total = 0;

    for (const entry of CATEGORIES) {
      const parent = await this.prisma.category.create({
        data: {
          name: entry.name,
          type: entry.type,
          icon: entry.icon,
          createdAt: now,
        },
      });
      total++;

      if (entry.children?.length) {
        await this.prisma.category.createMany({
          data: entry.children.map((child) => ({
            name: child.name,
            type: entry.type,
            icon: entry.icon,
            parentId: parent.id,
            createdAt: now,
          })),
        });
        total += entry.children.length;
      }
    }

    this.logger.log(`Seeded ${total} categories`);
    return total;
  }

  async seedTranslations(): Promise<number> {
    const count = await this.prisma.categoryTranslation.count();
    if (count > 0) {
      this.logger.log('Translation seed skipped: table already contains data');
      return 0;
    }

    const allCategories = await this.prisma.category.findMany({
      include: { parent: { select: { name: true } } },
    });

    if (allCategories.length === 0) {
      this.logger.warn(
        'Translation seed skipped: no categories found (run category seed first)',
      );
      return 0;
    }

    const keyToId = new Map<string, bigint>();
    for (const cat of allCategories) {
      const key = cat.parent ? `${cat.parent.name}|${cat.name}` : cat.name;
      keyToId.set(key, cat.id);
    }

    const now = new Date();
    const records: Array<{
      categoryId: bigint;
      language: string;
      name: string;
      createdAt: Date;
    }> = [];

    for (const entry of CATEGORIES) {
      const parentId = keyToId.get(entry.name);
      if (parentId === undefined) continue;

      records.push(
        {
          categoryId: parentId,
          language: 'en',
          name: entry.name,
          createdAt: now,
        },
        {
          categoryId: parentId,
          language: 'es',
          name: entry.es,
          createdAt: now,
        },
        {
          categoryId: parentId,
          language: 'pt',
          name: entry.pt,
          createdAt: now,
        },
      );

      for (const child of entry.children ?? []) {
        const childId = keyToId.get(`${entry.name}|${child.name}`);
        if (childId === undefined) continue;

        records.push(
          {
            categoryId: childId,
            language: 'en',
            name: child.name,
            createdAt: now,
          },
          {
            categoryId: childId,
            language: 'es',
            name: child.es,
            createdAt: now,
          },
          {
            categoryId: childId,
            language: 'pt',
            name: child.pt,
            createdAt: now,
          },
        );
      }
    }

    await this.prisma.categoryTranslation.createMany({ data: records });
    this.logger.log(`Seeded ${records.length} category translations`);
    return records.length;
  }
}
