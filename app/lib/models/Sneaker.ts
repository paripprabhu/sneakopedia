import mongoose, { Schema } from 'mongoose';

export interface IRetailerLink {
  retailer:  string;   // e.g. "Crepdog Crew" | "VegNonVeg" | "Mainstreet" | "Superkicks" | "LTD Edition"
  url:       string;   // Direct product page URL (never a search URL)
  price:     number;   // INR price at time of scrape
  scrapedAt: Date;
  source:    string;   // domain string e.g. "crepdogcrew.com"
}

export interface ISneaker {
  _id:           string;
  shoeName:      string;
  canonicalName: string;   // normalised match key — used to deduplicate across retailers
  brand:         string;
  retailPrice:   number;   // lowest price seen across all scraped retailers
  currency:      string;
  thumbnail:     string;
  description:   string;
  url?:          string;   // kept for backward compat with legacy single-retailer records
  rand?:         number;
  retailerLinks: IRetailerLink[];  // one entry per scraped retailer
}

const RetailerLinkSchema = new Schema<IRetailerLink>(
  {
    retailer:  { type: String, default: '' },
    url:       { type: String, default: '' },
    price:     { type: Number, default: 0 },
    scrapedAt: { type: Date,   default: () => new Date() },
    source:    { type: String, default: '' },
  },
  { _id: false }  // sub-documents don't need their own _id
);

const SneakerSchema = new Schema<ISneaker>(
  {
    _id:           { type: String, required: true },
    shoeName:      { type: String, required: true },
    canonicalName: { type: String, default: '' },
    brand:         { type: String, required: true, index: true },
    retailPrice:   { type: Number, default: 0, index: true },
    currency:      { type: String, default: 'INR' },
    thumbnail:     { type: String, default: '' },
    description:   { type: String, default: '' },
    url:           { type: String, default: '' },
    rand:          { type: Number, default: () => Math.random(), index: true },
    retailerLinks: { type: [RetailerLinkSchema], default: [] },
  },
  { timestamps: false }
);

// Compound index for regex text search on shoeName + brand
SneakerSchema.index({ shoeName: 1, brand: 1 });

// Text index for full-text search (faster than regex for large collections)
SneakerSchema.index({ shoeName: 'text', brand: 'text' });

// Sparse unique index on canonicalName+brand — enforces one doc per shoe but
// only applies to docs where canonicalName is non-empty, leaving all legacy
// catalog records (canonicalName: '') completely untouched.
SneakerSchema.index({ canonicalName: 1, brand: 1 }, { unique: true, sparse: true });

// Allows filtering/querying by specific retailer: { 'retailerLinks.retailer': 'Superkicks' }
SneakerSchema.index({ 'retailerLinks.retailer': 1 });

const Sneaker =
  (mongoose.models.Sneaker as mongoose.Model<ISneaker>) ||
  mongoose.model<ISneaker>('Sneaker', SneakerSchema);

export default Sneaker;
