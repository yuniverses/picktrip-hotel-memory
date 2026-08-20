"use client";

import { Building2, MapPin, Star, X } from "lucide-react";
import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import {
  type DisplayHotel,
  formatStayTotal,
  type HotelDetail,
} from "@/src/lib/picktrip/hotel-commerce";

export function HotelDetailDrawer({
  hotel,
  onClose,
}: {
  hotel: DisplayHotel;
  onClose: () => void;
}) {
  const [detail, setDetail] = useState<HotelDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    setDetail(null);
    void fetch("/api/hotel/detail", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hotelId: hotel.hotelId }),
      signal: controller.signal,
    })
      .then(async (response) => {
        const payload = await response.json().catch(() => null);
        if (!response.ok) throw new Error(payload?.error || "Hotel details are unavailable.");
        setDetail(payload.detail as HotelDetail);
      })
      .catch((reason) => {
        if (!controller.signal.aborted) {
          setError(reason instanceof Error ? reason.message : "Hotel details are unavailable.");
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [hotel.hotelId]);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  const facilities = useMemo(
    () => [
      ...new Set([
        ...(detail?.facilities ?? []),
        ...(detail?.highlights ?? []),
        ...hotel.highlights,
      ]),
    ],
    [detail, hotel.highlights],
  );
  const images = detail?.imageList.length
    ? detail.imageList
    : hotel.primaryImage
      ? [hotel.primaryImage]
      : [];
  const total = formatStayTotal(hotel.stayPrice);

  return (
    <div
      className="detail-backdrop"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <section
        className="detail-drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="hotel-detail-title"
      >
        <button
          className="detail-close"
          type="button"
          onClick={onClose}
          aria-label="Close hotel details"
          autoFocus
        >
          <X size={21} />
        </button>
        <div className="detail-gallery">
          {images[0] ? (
            <Image
              src={images[0]}
              alt=""
              fill
              sizes="(max-width: 760px) 100vw, 540px"
              unoptimized
            />
          ) : (
            <div className="detail-image-placeholder">
              <Building2 size={48} />
            </div>
          )}
          {images.length > 1 ? (
            <span className="detail-photo-count">{images.length} photos</span>
          ) : null}
        </div>
        <div className="detail-body">
          <p className="detail-eyebrow">Hotel details</p>
          <h2 id="hotel-detail-title">{detail?.name || hotel.name || hotel.nameEn}</h2>
          <div className="detail-meta">
            <span>
              <Star size={15} fill="currentColor" />{" "}
              {detail?.ratingScore ?? hotel.ratingScore ?? hotel.starRating}
            </span>
            <span>{detail?.star ?? hotel.starRating} star</span>
          </div>
          <p className="detail-address">
            <MapPin size={16} /> {detail?.address || hotel.address}
          </p>
          {loading ? <div className="detail-loading">Loading verified hotel details…</div> : null}
          {error ? <div className="detail-error">{error}</div> : null}
          {!loading && !error ? (
            <>
              {detail?.introduction ? (
                <p className="detail-introduction">{detail.introduction}</p>
              ) : null}
              {facilities.length ? (
                <div className="detail-section">
                  <h3>Facilities & highlights</h3>
                  <div className="facility-list">
                    {facilities.map((facility) => (
                      <span key={facility}>{facility}</span>
                    ))}
                  </div>
                </div>
              ) : null}
            </>
          ) : null}
          <div className="detail-price">
            <span>Sep 23–26 · 2 adults</span>
            <strong>{total ? `${total} stay total` : "No live price for these dates"}</strong>
          </div>
        </div>
      </section>
    </div>
  );
}
