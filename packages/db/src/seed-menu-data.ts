/**
 * Catalogo reale Pizza Guys — "Travelling Kitchen" (tovaglietta settembre 2026).
 * Estratto da TOVAGLIETTE MENU SETTEMBRE 2026 02-1.pdf — 11 categorie.
 *
 * ATTENZIONE: gli allergeni sono una bozza dedotta dagli ingredienti in menu.
 * Vanno verificati con cucina/titolare prima di andare live (Reg. UE 1169/2011).
 */

export interface SeedCategory {
  key: string;
  name: string;
  colorHex: string;
  defaultVatRate: 4 | 10 | 22;
  hold?: boolean;
  dessert?: boolean;
  products: Array<{ name: string; price: number; allergenIds?: string[] }>;
}

export interface SeedVariant {
  name: string;
  type: "ADD" | "REMOVE";
  priceDelta: number;
}

export interface SeedVariantGroup {
  key: string;
  name: string;
  /** Chiavi categorie da MENU_CATALOG (es. classic-pizzas, storytelling-pizzas). */
  categoryKeys: string[];
  variants: SeedVariant[];
}

/**
 * Rimozioni: elenco ingredienti reali di ogni pizza (delta 0).
 * Aggiunte: solo quelle esplicitamente presenti in menu (bufala €3 su Margherita).
 * Altri extra a pagamento non in menu — da confermare col cliente prima di aggiungerli.
 */
export const VARIANT_CATALOG: SeedVariantGroup[] = [
  {
    key: "personalizza-classic",
    name: "Personalizza",
    categoryKeys: ["classic-pizzas"],
    variants: [
      { name: "Pomodoro", type: "REMOVE", priceDelta: 0 },
      { name: "Fior di latte", type: "REMOVE", priceDelta: 0 },
      { name: "Basilico", type: "REMOVE", priceDelta: 0 },
      { name: "Provola", type: "REMOVE", priceDelta: 0 },
      { name: "Crema di ricotta", type: "REMOVE", priceDelta: 0 },
      { name: "Zola", type: "REMOVE", priceDelta: 0 },
      { name: "Brie", type: "REMOVE", priceDelta: 0 },
      { name: "Salvia", type: "REMOVE", priceDelta: 0 },
      { name: "Crema di zucca", type: "REMOVE", priceDelta: 0 },
      { name: "Pancetta", type: "REMOVE", priceDelta: 0 },
      { name: "Cipolla", type: "REMOVE", priceDelta: 0 },
      { name: "'Nduja", type: "REMOVE", priceDelta: 0 },
      { name: "Würstel", type: "REMOVE", priceDelta: 0 },
      { name: "Patatine", type: "REMOVE", priceDelta: 0 },
      { name: "Cheddar", type: "REMOVE", priceDelta: 0 },
      { name: "Salsiccia piccante", type: "REMOVE", priceDelta: 0 },
      { name: "Mozzarella di Bufala", type: "ADD", priceDelta: 3 },
    ],
  },
  {
    key: "personalizza-storytelling",
    name: "Personalizza",
    categoryKeys: ["storytelling-pizzas"],
    variants: [
      { name: "Fior di latte", type: "REMOVE", priceDelta: 0 },
      { name: "Pomodoro", type: "REMOVE", priceDelta: 0 },
      { name: "Manzo Rendang", type: "REMOVE", priceDelta: 0 },
      { name: "Latte di cocco", type: "REMOVE", priceDelta: 0 },
      { name: "Arachidi", type: "REMOVE", priceDelta: 0 },
      { name: "Lime", type: "REMOVE", priceDelta: 0 },
      { name: "Cipollotto", type: "REMOVE", priceDelta: 0 },
      { name: "Basilico", type: "REMOVE", priceDelta: 0 },
      { name: "Salsiccia al curry", type: "REMOVE", priceDelta: 0 },
      { name: "Pancetta", type: "REMOVE", priceDelta: 0 },
      { name: "Sriracha mayo", type: "REMOVE", priceDelta: 0 },
      { name: "Pomodoro al garam masala", type: "REMOVE", priceDelta: 0 },
      { name: "Pollo speziato al curry", type: "REMOVE", priceDelta: 0 },
      { name: "Tzatziki", type: "REMOVE", priceDelta: 0 },
      { name: "Menta", type: "REMOVE", priceDelta: 0 },
      { name: "Limone", type: "REMOVE", priceDelta: 0 },
      { name: "Kimchi", type: "REMOVE", priceDelta: 0 },
      { name: "Funghi porcini", type: "REMOVE", priceDelta: 0 },
      { name: "Sesamo", type: "REMOVE", priceDelta: 0 },
    ],
  },
];

export const PILOT_LOCATION = {
  name: "Caserta — Corso Trieste",
  address: "Corso Trieste 285, 81100 Caserta CE",
  vatNumber: "12345678901",
  managerEmail: "manager.caserta@pizzaguys.it",
  coverChargeAmount: 1.5,
};

export const MENU_CATALOG: SeedCategory[] = [
  {
    key: "cocktail-bar",
    name: "Cocktail Bar",
    colorHex: "#EA580C",
    defaultVatRate: 22,
    products: [
      { name: "Aperol Spritz", price: 5, allergenIds: ["solfiti"] },
      { name: "Americano", price: 6, allergenIds: ["solfiti"] },
      { name: "Negroni", price: 7, allergenIds: ["solfiti"] },
      { name: "Gin Tonic", price: 7 },
    ],
  },
  {
    key: "soft-drink",
    name: "Soft Drink",
    colorHex: "#0EA5E9",
    defaultVatRate: 22,
    products: [
      { name: "Acqua Naturale/Frizzante 50cl", price: 1.5 },
      { name: "Acqua Naturale/Frizzante 1L", price: 2.5 },
      { name: "Coca Cola 33cl", price: 2.5 },
      { name: "Coca Cola Zero 33cl", price: 2.5 },
      { name: "Fanta 33cl", price: 2.5 },
    ],
  },
  {
    key: "beer",
    name: "Beer",
    colorHex: "#CA8A04",
    defaultVatRate: 22,
    products: [
      { name: "Birra Bionda 33cl", price: 4, allergenIds: ["glutine"] },
      { name: "Birra Rossa 33cl", price: 5, allergenIds: ["glutine"] },
      { name: "Birra Weizen 50cl", price: 6, allergenIds: ["glutine"] },
    ],
  },
  {
    key: "wine",
    name: "Wine",
    colorHex: "#7C3AED",
    defaultVatRate: 22,
    products: [
      { name: "Vino Rosso/Bianco Calice", price: 4, allergenIds: ["solfiti"] },
      { name: "Vino Rosso/Bianco Bottiglia", price: 18, allergenIds: ["solfiti"] },
      { name: "Prosecco Calice", price: 4, allergenIds: ["solfiti"] },
      { name: "Prosecco Bottiglia", price: 18, allergenIds: ["solfiti"] },
    ],
  },
  {
    key: "digestivi",
    name: "Digestivi",
    colorHex: "#92400E",
    defaultVatRate: 22,
    products: [
      { name: "Amaro", price: 3 },
      { name: "Limoncello", price: 3 },
      { name: "Grappa", price: 6 },
    ],
  },
  {
    key: "tapas-fritti-bar",
    name: "Tapas Fritti Bar",
    colorHex: "#D97706",
    defaultVatRate: 10,
    products: [
      {
        name: "Arancino al Telefono",
        price: 8,
        allergenIds: ["glutine", "latte", "uova"],
      },
      {
        name: "Croquetas de Patatas",
        price: 7,
        allergenIds: ["glutine", "latte", "uova"],
      },
      {
        name: "Pulled Pork-Balls",
        price: 9,
        allergenIds: ["glutine", "soia"],
      },
    ],
  },
  {
    key: "fries",
    name: "Fries",
    colorHex: "#F59E0B",
    defaultVatRate: 10,
    products: [
      { name: "French Fries", price: 4 },
      { name: "Japanese Spices Fries", price: 5, allergenIds: ["sesamo"] },
      { name: "Sweet Potatoes Fries", price: 7, allergenIds: ["soia"] },
      { name: "Posh Chips", price: 7, allergenIds: ["latte"] },
    ],
  },
  {
    key: "travelling-kitchen",
    name: "Travelling Kitchen",
    colorHex: "#16A34A",
    defaultVatRate: 10,
    products: [
      {
        name: "Baba Ganoush",
        price: 9,
        allergenIds: ["glutine", "latte", "sesamo"],
      },
      {
        name: "Veggie's Dumpling Chinatown",
        price: 10,
        allergenIds: ["glutine", "soia"],
      },
      { name: "Beef Rendang", price: 10, allergenIds: ["arachidi"] },
      {
        name: "Korean Fried Chicken",
        price: 9,
        allergenIds: ["glutine", "latte", "arachidi", "sesamo"],
      },
    ],
  },
  {
    key: "storytelling-pizzas",
    name: "Storytelling Pizzas",
    colorHex: "#DC2626",
    defaultVatRate: 10,
    products: [
      {
        name: "Beef Rendang Pizza",
        price: 14,
        allergenIds: ["glutine", "latte", "arachidi"],
      },
      {
        name: "Thai Sausage Curry",
        price: 13,
        allergenIds: ["glutine", "latte", "arachidi", "uova"],
      },
      {
        name: "Chicken Tikka Tikka",
        price: 12,
        allergenIds: ["glutine", "latte"],
      },
      {
        name: "Kimchi & Funghi Porcini Misti",
        price: 10,
        allergenIds: ["glutine", "latte", "arachidi", "sesamo", "soia"],
      },
    ],
  },
  {
    key: "classic-pizzas",
    name: "Classic Pizzas",
    colorHex: "#B91C1C",
    defaultVatRate: 10,
    products: [
      { name: "Margherita", price: 7, allergenIds: ["glutine", "latte"] },
      { name: "Provola & Pepe", price: 9, allergenIds: ["glutine", "latte"] },
      { name: "French Kiss", price: 10, allergenIds: ["glutine", "latte"] },
      { name: "Pizza alla Zucca", price: 10, allergenIds: ["glutine", "latte"] },
      { name: "Berlin Calling", price: 9, allergenIds: ["glutine", "latte"] },
      {
        name: "New York Pepperoni",
        price: 12,
        allergenIds: ["glutine", "latte"],
      },
    ],
  },
  {
    key: "desserts",
    name: "Desserts",
    colorHex: "#A855F7",
    defaultVatRate: 10,
    dessert: true,
    hold: true,
    products: [
      {
        name: "Peanut Butter Brownie",
        price: 6,
        allergenIds: ["glutine", "latte", "uova", "arachidi"],
      },
      {
        name: "Amalfi Lemon Tart",
        price: 7,
        allergenIds: ["glutine", "latte", "uova"],
      },
    ],
  },
];
