"use client";

import { Bookmark, Building2, MapPin, Star } from "lucide-react";
import Image from "next/image";
import type { MapPin as AiMapPin } from "@/src/domain/schemas";
import { type DisplayHotel, formatStayTotal } from "@/src/lib/picktrip/hotel-commerce";

export function HotelCard({
  hotel,
  recommendation,
  selected,
  onHighlight,
  onOpen,
}: {
  hotel: DisplayHotel;
  recommendation?: AiMapPin;
  selected: boolean;
  onHighlight: () => void;
  onOpen: () => void;
}) {
  const total = formatStayTotal(hotel.stayPrice);
  const priceLabel =
    hotel.priceStatus === "loading"
      ? "Checking 3-night total…"
      : hotel.priceStatus === "error"
        ? "Price unavailable"
        : total
          ? `${total} stay total`
          : "No price for these dates";
  return (
    <article className={`hotel-card${selected ? " is-selected" : ""}`} onMouseEnter={onHighlight}>
      <button
        className="hotel-card-main"
        type="button"
        onClick={onOpen}
        onFocus={onHighlight}
        aria-label={`Open details for ${hotel.name || hotel.nameEn}`}
      >
        <div className="hotel-image-wrap">
          {hotel.primaryImage ? (
            <Image
              className="hotel-image"
              src={hotel.primaryImage}
              alt=""
              fill
              sizes="(max-width: 760px) 100vw, 31vw"
              unoptimized
            />
          ) : (
            <div className="hotel-image-placeholder">
              <Building2 size={42} />
            </div>
          )}
          {recommendation ? <span className="memory-badge">Recommended for you</span> : null}
        </div>
        <div className="hotel-copy">
          <span className="distance-chip">
            <MapPin size={14} /> {hotel.cityName || hotel.destinationName || "Hotel"}
          </span>
          <div className="hotel-title-row">
            <h2>{hotel.name || hotel.nameEn}</h2>
            <span className="rating">
              <Star size={15} fill="currentColor" />{" "}
              {(hotel.ratingScore ?? hotel.starRating) || "—"}
            </span>
          </div>
          <p>{hotel.address || hotel.highlights.join(" · ")}</p>
          {recommendation ? (
            <p className="recommendation-reason">✦ {recommendation.reason}</p>
          ) : null}
          <div className="price-row">
            <span>{priceLabel}</span>
            <Bookmark size={19} aria-hidden="true" />
          </div>
        </div>
      </button>
    </article>
  );
}
