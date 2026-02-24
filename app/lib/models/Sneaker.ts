import mongoose, { Schema } from 'mongoose';

export interface ISneaker {
  _id: string;
  shoeName: string;
  brand: string;
  retailPrice: number;
  currency: string;
  thumbnail: string;
  description: string;
  url?: string;
  rand?: number;
}

const SneakerSchema = new Schema<ISneaker>(
  {
    _id:         { type: String, required: true },
    shoeName:    { type: String, required: true },
    brand:       { type: String, required: true, index: true },
    retailPrice: { type: Number, default: 0, index: true },
    currency:    { type: String, default: 'INR' },
    thumbnail:   { type: String, default: '' },
    description: { type: String, default: '' },
    url:         { type: String, default: '' },
    rand:        { type: Number, default: () => Math.random(), index: true },
  },
  { timestamps: false }
);

// Compound index for regex text search on shoeName + brand
SneakerSchema.index({ shoeName: 1, brand: 1 });

const Sneaker =
  (mongoose.models.Sneaker as mongoose.Model<ISneaker>) ||
  mongoose.model<ISneaker>('Sneaker', SneakerSchema);

export default Sneaker;
