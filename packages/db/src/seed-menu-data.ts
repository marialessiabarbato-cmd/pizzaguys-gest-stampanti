/** Catalogo pilota Pizza Guys Caserta — 8 categorie, 80 articoli (T6.4). */

export interface SeedCategory {
  key: string;
  name: string;
  colorHex: string;
  defaultVatRate: 4 | 10 | 22;
  hold?: boolean;
  dessert?: boolean;
  products: Array<{ name: string; price: number }>;
}

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
