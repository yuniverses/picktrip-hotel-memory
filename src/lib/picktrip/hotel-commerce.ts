import { z } from "zod";
import type { HotelCandidate } from "@/src/domain/schemas";
import { getPicktripApiUrl } from "./config";
import { PicktripApiError } from "./hotel-client";

export type HotelLowestPrice = {
  hotelId: string;
  displayPriceFrom: number | null;
  displayPricePerNightFrom: number | null;
  displayStayTotalFrom: number | null;
  priceBasis: string | null;
  displayCurrency: string;
  fractionDigits: number;
  displayFractionDigits: number;
};

export type DisplayHotel = HotelCandidate & {
  stayPrice?: HotelLowestPrice | null;
  priceStatus?: "loading" | "ready" | "unavailable" | "error";
};

export type HotelDetail = {
  hotelId: string;
  name: string;
  nameEn: string;
  address: string;
  cityName: string;
  countryName: string;
  star: number;
  ratingScore: number | null;
  reviewCount: number;
  introduction: string;
  latitude: number;
  longitude: number;
  imageList: string[];
  facilities: string[];
  highlights: string[];
  siteId: string;
};

export type LowestPriceRequest = {
  hotelIds: string[];
  checkIn: string;
  checkOut: string;
  currency: string;
  adults: number;
  children: number;
  rooms: number;
  nationality?: string;
};

const rawPricesSchema = z.object({
  data: z
    .object({
      prices: z
        .array(
          z
            .object({
              hotelId: z.string().optional(),
              displayPriceFrom: z.number().nullable().optional(),
              displayPricePerNightFrom: z.number().nullable().optional(),
              displayStayTotalFrom: z.number().nullable().optional(),
              priceBasis: z.string().nullable().optional(),
              displayCurrency: z.string().optional(),
              fractionDigits: z.number().int().optional(),
              displayFractionDigits: z.number().int().optional(),
            })
            .passthrough(),
        )
        .optional(),
    })
    .optional(),
});

const facilitySchema = z.union([z.string(), z.object({ name: z.string().optional() })]);
const rawDetailSchema = z.object({
  data: z
    .object({
      siteId: z.string().nullish(),
      hotelBaseInfo: z
        .object({
          id: z.string().optional(),
          name: z.string().optional(),
          nameEn: z.string().optional(),
          address: z.string().optional(),
          cityName: z.string().optional(),
          countryName: z.string().optional(),
          star: z.number().optional(),
          ratingScore: z.number().nullable().optional(),
          reviewCount: z.number().int().nonnegative().optional(),
          introduction: z.string().optional(),
          latitude: z.union([z.string(), z.number()]).optional(),
          longitude: z.union([z.string(), z.number()]).optional(),
          imageList: z.array(z.string()).optional(),
          facilities: z.array(facilitySchema).optional(),
          highlights: z.array(z.string()).optional(),
        })
        .passthrough()
        .optional(),
    })
    .optional(),
});

type Fetcher = typeof fetch;

export async function fetchHotelLowestPrices(
  input: LowestPriceRequest,
  token: string,
  fetcher: Fetcher = fetch,
  apiUrl = getPicktripApiUrl(),
): Promise<HotelLowestPrice[]> {
  if (input.hotelIds.length === 0) return [];
  const payload = await picktripRequest(
    `${apiUrl}/app/shopping/hotel/lowest-prices`,
    token,
    fetcher,
    { method: "POST", body: JSON.stringify(input) },
  );
  const parsed = rawPricesSchema.parse(payload);
  return (parsed.data?.prices ?? []).flatMap((price) =>
    price.hotelId
      ? [
          {
            hotelId: price.hotelId,
            displayPriceFrom: price.displayPriceFrom ?? null,
            displayPricePerNightFrom: price.displayPricePerNightFrom ?? null,
            displayStayTotalFrom: price.displayStayTotalFrom ?? null,
            priceBasis: price.priceBasis ?? null,
            displayCurrency: price.displayCurrency || input.currency,
            fractionDigits: price.fractionDigits ?? 2,
            displayFractionDigits: price.displayFractionDigits ?? price.fractionDigits ?? 2,
          },
        ]
      : [],
  );
}

export async function fetchHotelDetail(
  hotelId: string,
  token: string,
  fetcher: Fetcher = fetch,
  apiUrl = getPicktripApiUrl(),
): Promise<HotelDetail | null> {
  const payload = await picktripRequest(
    `${apiUrl}/app/shopping/hotel/${encodeURIComponent(hotelId)}`,
    token,
    fetcher,
    { method: "GET" },
  );
  const parsed = rawDetailSchema.parse(payload);
  const info = parsed.data?.hotelBaseInfo;
  if (!info) return null;
  return {
    hotelId: info.id || hotelId,
    name: info.name || "",
    nameEn: info.nameEn || "",
    address: info.address || "",
    cityName: info.cityName || "",
    countryName: info.countryName || "",
    star: info.star ?? 0,
    ratingScore: info.ratingScore ?? null,
    reviewCount: info.reviewCount ?? 0,
    introduction: info.introduction || "",
    latitude: finiteNumber(info.latitude),
    longitude: finiteNumber(info.longitude),
    imageList: (info.imageList ?? []).filter((url) => /^https?:\/\//i.test(url)).slice(0, 60),
    facilities: normalizeFacilities(info.facilities ?? []),
    highlights: info.highlights ?? [],
    siteId: parsed.data?.siteId ?? "",
  };
}

export function mergeHotelPrices(
  hotels: HotelCandidate[],
  prices: HotelLowestPrice[],
): DisplayHotel[] {
  const byHotel = new Map(prices.map((price) => [price.hotelId, price]));
  return hotels.map((hotel) => {
    const price = byHotel.get(hotel.hotelId);
    const available = Boolean(price && (price.displayStayTotalFrom ?? 0) > 0);
    return {
      ...hotel,
      stayPrice: available ? price : null,
      priceStatus: available ? "ready" : "unavailable",
    };
  });
}

export function formatStayTotal(price: HotelLowestPrice | null | undefined): string | null {
  if (!price?.displayStayTotalFrom || price.displayStayTotalFrom <= 0) return null;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: price.displayCurrency,
    minimumFractionDigits: price.displayFractionDigits,
    maximumFractionDigits: price.displayFractionDigits,
  }).format(price.displayStayTotalFrom);
}

async function picktripRequest(
  url: string,
  token: string,
  fetcher: Fetcher,
  init: Pick<RequestInit, "method" | "body">,
): Promise<unknown> {
  const response = await fetcher(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    cache: "no-store",
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new PicktripApiError(response.status, payload);
  return payload;
}

function normalizeFacilities(values: Array<string | { name?: string }>): string[] {
  return [
    ...new Set(
      values
        .map((value) => (typeof value === "string" ? value : value.name || ""))
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  ];
}

function finiteNumber(value: string | number | undefined): number {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}
