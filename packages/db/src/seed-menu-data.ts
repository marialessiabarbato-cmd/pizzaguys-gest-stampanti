/** Catalogo pilota Pizza Guys Caserta — 8 categorie, 80 articoli (T6.4). */

export interface SeedCategory {
  key: string;
  name: string;
  colorHex: string;
  defaultVatRate: 4 | 10 | 22;
  hold?: boolean;
  dessert?: boolean;
  products: Array<{ name: string; price: number; allergenIds?: string[] }>;
}

/** Allergeni UE — id allineati a handheld/cloud constants. */
export const PRODUCT_ALLERGENS: Record<string, string[]> = {
  Marinara: ["glutine"],
  "Tonno e Cipolla": ["glutine", "pesce"],
  "Tonno e Mais": ["pesce"],
  "Salmone e Phila": ["glutine", "pesce", "latte"],
  Caesar: ["glutine", "latte", "uova", "senape"],
  "Polpette al Sugo": ["glutine", "uova", "latte"],
  "Crocchè Napoletani": ["glutine", "uova", "latte"],
  "Arancini Ragù": ["glutine", "latte"],
  Montanarine: ["glutine", "latte"],
  Tiramisù: ["glutine", "latte", "uova"],
  Cheesecake: ["glutine", "latte", "uova"],
  Profiteroles: ["glutine", "latte", "uova"],
  "Nutella Pizza": ["glutine", "latte"],
  "Cannolo Siciliano": ["glutine", "latte", "uova"],
  Babà: ["glutine", "uova", "latte"],
  "Gelato Artigianale": ["latte"],
  Sfogliatella: ["glutine", "latte"],
};

export function allergensForProduct(categoryKey: string, productName: string): string[] {
  if (PRODUCT_ALLERGENS[productName]) return PRODUCT_ALLERGENS[productName];
  if (["classiche", "speciali", "focacce"].includes(categoryKey)) {
    return ["glutine", "latte"];
  }
  if (categoryKey === "dolci") return ["glutine", "latte", "uova"];
  if (categoryKey === "antipasti") return ["glutine"];
  if (categoryKey === "insalate" && /tonno/i.test(productName)) return ["pesce"];
  return [];
}

export interface SeedVariant {
  name: string;
  type: "ADD" | "REMOVE";
  priceDelta: number;
}

export interface SeedVariantGroup {
  key: string;
  name: string;
  /** Chiavi categorie da MENU_CATALOG (es. classiche, speciali). */
  categoryKeys: string[];
  variants: SeedVariant[];
}

/** Unico gruppo varianti pilota — rimozioni e aggiunte nella stessa lista. */
export const VARIANT_CATALOG: SeedVariantGroup[] = [
  {
    key: "impasto-personalizza",
    name: "Personalizza",
    categoryKeys: ["classiche", "speciali", "focacce"],
    variants: [
      { name: "Mozzarella", type: "REMOVE", priceDelta: 0 },
      { name: "Pomodoro", type: "REMOVE", priceDelta: 0 },
      { name: "Basilico", type: "REMOVE", priceDelta: 0 },
      { name: "Prosciutto cotto", type: "REMOVE", priceDelta: 0 },
      { name: "Funghi", type: "REMOVE", priceDelta: 0 },
      { name: "Olive", type: "REMOVE", priceDelta: 0 },
      { name: "Würstel", type: "REMOVE", priceDelta: 0 },
      { name: "Salame piccante", type: "REMOVE", priceDelta: 0 },
      { name: "Acciughe", type: "REMOVE", priceDelta: 0 },
      { name: "Cipolla", type: "REMOVE", priceDelta: 0 },
      { name: "Rosmarino", type: "REMOVE", priceDelta: 0 },
      { name: "Salsiccia", type: "REMOVE", priceDelta: 0 },
      { name: "Bufala", type: "ADD", priceDelta: 2 },
      { name: "Prosciutto crudo", type: "ADD", priceDelta: 2 },
      { name: "Funghi porcini", type: "ADD", priceDelta: 2.5 },
      { name: "Rucola", type: "ADD", priceDelta: 1.5 },
      { name: "Parmigiano", type: "ADD", priceDelta: 1 },
      { name: "Patatine fritte", type: "ADD", priceDelta: 2 },
      { name: "Nduja", type: "ADD", priceDelta: 2 },
      { name: "Uovo", type: "ADD", priceDelta: 1 },
      { name: "Gorgonzola", type: "ADD", priceDelta: 1.5 },
      { name: "Mortadella", type: "ADD", priceDelta: 2 },
      { name: "Pistacchio", type: "ADD", priceDelta: 1.5 },
      { name: "Tartufo", type: "ADD", priceDelta: 3 },
      { name: "Speck", type: "ADD", priceDelta: 2 },
      { name: "Ricotta", type: "ADD", priceDelta: 1.5 },
      { name: "Olive nere", type: "ADD", priceDelta: 1 },
      { name: "Stracchino", type: "ADD", priceDelta: 1.5 },
      { name: "Friarielli", type: "ADD", priceDelta: 2 },
      { name: "Salsiccia", type: "ADD", priceDelta: 2 },
    ],
  },
];

export const PILOT_LOCATION = {
  name: "Caserta — Via Roma",
  address: "Via Roma 42, 81100 Caserta CE",
  vatNumber: "12345678901",
  managerEmail: "manager.caserta@pizzaguys.it",
};

export const MENU_CATALOG: SeedCategory[] = [
  {
    key: "classiche",
    name: "Pizze Classiche",
    colorHex: "#DC2626",
    defaultVatRate: 10,
    products: [
      { name: "Margherita", price: 6.5 },
      { name: "Marinara", price: 5.5 },
      { name: "Napoli", price: 7.0 },
      { name: "Diavola", price: 8.0 },
      { name: "Würstel", price: 7.5 },
      { name: "Prosciutto", price: 7.5 },
      { name: "Funghi", price: 7.0 },
      { name: "Carciofi", price: 7.5 },
      { name: "Tonno e Cipolla", price: 8.0 },
      { name: "4 Formaggi", price: 9.0 },
      { name: "Capricciosa", price: 9.5 },
      { name: "Bufala e Pomodorini", price: 10.0 },
    ],
  },
  {
    key: "speciali",
    name: "Pizze Speciali",
    colorHex: "#B91C1C",
    defaultVatRate: 10,
    products: [
      { name: "Guys Special", price: 11.0 },
      { name: "Caserta D.O.P.", price: 12.0 },
      { name: "Burger Guys", price: 11.5 },
      { name: "Porchetta e Friarielli", price: 11.0 },
      { name: "Tartufo e Scaglie", price: 13.0 },
      { name: "Salmone e Phila", price: 12.5 },
      { name: "Mortadella e Pistacchio", price: 12.0 },
      { name: "Nduja e Ricotta", price: 11.5 },
      { name: "Vegetariana Deluxe", price: 10.5 },
      { name: "Calabra", price: 10.0 },
      { name: "Americana", price: 9.5 },
      { name: "Boscaiola", price: 10.5 },
    ],
  },
  {
    key: "focacce",
    name: "Focacce e Calzoni",
    colorHex: "#EA580C",
    defaultVatRate: 10,
    products: [
      { name: "Focaccia Rosmarino", price: 4.5 },
      { name: "Focaccia al Pomodoro", price: 5.0 },
      { name: "Focaccia Salsiccia", price: 6.5 },
      { name: "Calzone Classico", price: 8.5 },
      { name: "Calzone Guys", price: 9.5 },
      { name: "Panuozzo Prosciutto", price: 7.0 },
      { name: "Panuozzo Mortadella", price: 7.5 },
      { name: "Ripieno Friarielli", price: 8.0 },
    ],
  },
  {
    key: "antipasti",
    name: "Antipasti",
    colorHex: "#D97706",
    defaultVatRate: 10,
    products: [
      { name: "Patatine Fritte", price: 4.0 },
      { name: "Crocchè Napoletani", price: 5.0 },
      { name: "Arancini Ragù", price: 5.5 },
      { name: "Montanarine", price: 6.0 },
      { name: "Caprese", price: 7.0 },
      { name: "Bruschetta Pomodoro", price: 4.5 },
      { name: "Polpette al Sugo", price: 6.5 },
      { name: "Parmigiana di Melanzane", price: 7.5 },
      { name: "Tagliere Salumi", price: 9.0 },
      { name: "Frittatina", price: 4.5 },
    ],
  },
  {
    key: "insalate",
    name: "Insalate",
    colorHex: "#16A34A",
    defaultVatRate: 10,
    products: [
      { name: "Insalata Mista", price: 5.5 },
      { name: "Caesar", price: 7.5 },
      { name: "Greca", price: 7.0 },
      { name: "Tonno e Mais", price: 8.0 },
      { name: "Pollo e Avocado", price: 9.0 },
      { name: "Caprese Bowl", price: 8.5 },
      { name: "Quinoa e Verdure", price: 8.0 },
      { name: "Guys Bowl", price: 9.5 },
    ],
  },
  {
    key: "dolci",
    name: "Dolci",
    colorHex: "#A855F7",
    defaultVatRate: 10,
    dessert: true,
    products: [
      { name: "Tiramisù", price: 5.0 },
      { name: "Profiteroles", price: 5.5 },
      { name: "Cheesecake", price: 5.5 },
      { name: "Nutella Pizza", price: 6.0 },
      { name: "Sfogliatella", price: 3.5 },
      { name: "Babà", price: 4.0 },
      { name: "Gelato Artigianale", price: 4.5 },
      { name: "Cannolo Siciliano", price: 4.5 },
    ],
  },
  {
    key: "bevande",
    name: "Bevande",
    colorHex: "#2563EB",
    defaultVatRate: 22,
    products: [
      { name: "Acqua Naturale 0.5L", price: 1.5 },
      { name: "Acqua Frizzante 0.5L", price: 1.5 },
      { name: "Coca-Cola 33cl", price: 2.5 },
      { name: "Coca-Cola Zero 33cl", price: 2.5 },
      { name: "Fanta 33cl", price: 2.5 },
      { name: "Sprite 33cl", price: 2.5 },
      { name: "The Limone 33cl", price: 2.5 },
      { name: "The Pesca 33cl", price: 2.5 },
      { name: "Red Bull", price: 3.5 },
      { name: "Succo Arancia", price: 3.0 },
      { name: "Caffè Espresso", price: 1.2 },
      { name: "Caffè Macchiato", price: 1.5 },
    ],
  },
  {
    key: "birre-vini",
    name: "Birre e Vini",
    colorHex: "#7C3AED",
    defaultVatRate: 22,
    products: [
      { name: "Peroni 33cl", price: 3.5 },
      { name: "Ichnusa 33cl", price: 3.5 },
      { name: "Heineken 33cl", price: 4.0 },
      { name: "Artigianale IPA", price: 5.5 },
      { name: "Artigianale Blonde", price: 5.0 },
      { name: "Vino Rosso Calice", price: 4.0 },
      { name: "Vino Bianco Calice", price: 4.0 },
      { name: "Prosecco Calice", price: 4.5 },
      { name: "Lambrusco Bottiglia", price: 12.0 },
      { name: "Aglianico Bottiglia", price: 14.0 },
    ],
  },
];
