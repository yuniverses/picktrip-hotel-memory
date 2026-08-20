"use client";

import {
  ArrowRight,
  Bookmark,
  CalendarDays,
  Filter,
  Hotel,
  MapPinned,
  Search,
  SlidersHorizontal,
  Sparkles,
  UsersRound,
} from "lucide-react";
import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { createInitialHotelState, reduceHotelState } from "@/src/domain/hotel-state";
import {
  type HotelCandidate,
  hotelChatResponseSchema,
  type PoiCandidate,
} from "@/src/domain/schemas";
import { type DisplayHotel, mergeHotelPrices } from "@/src/lib/picktrip/hotel-commerce";
import { AuthControl, usePicktripSession } from "./auth-control";
import { HotelCard } from "./hotel-card";
import { HotelDetailDrawer } from "./hotel-detail-drawer";
import { HotelMap } from "./hotel-map";
import { type ChatMessage, MultiTurnChat } from "./multi-turn-chat";

export function HotelMemoryExperience() {
  const session = usePicktripSession();
  const [query, setQuery] = useState("Tokyo");
  const [hotels, setHotels] = useState<DisplayHotel[]>([]);
  const [state, dispatch] = useReducer(reduceHotelState, createInitialHotelState("Tokyo"));
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detailHotelId, setDetailHotelId] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [chatting, setChatting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [minStars, setMinStars] = useState(0);
  const searchRunRef = useRef(0);
  const bootstrappedUsersRef = useRef(new Set<string>());
  const [bootstrapStatus, setBootstrapStatus] = useState<{
    state: "idle" | "loading" | "ready" | "partial" | "error";
    preferencesWritten: number;
  }>({ state: "idle", preferencesWritten: 0 });

  useEffect(() => {
    const uid = session.user?.uid;
    if (!uid || bootstrappedUsersRef.current.has(uid)) return;
    bootstrappedUsersRef.current.add(uid);
    setBootstrapStatus({ state: "loading", preferencesWritten: 0 });
    void fetch("/api/memory/bootstrap", { method: "POST" })
      .then(async (response) => {
        const payload = await response.json().catch(() => null);
        if (!response.ok) throw new Error("Memory import failed");
        setBootstrapStatus({
          state: payload.status === "partial" ? "partial" : "ready",
          preferencesWritten: Number(payload.preferencesWritten ?? 0),
        });
      })
      .catch(() => setBootstrapStatus({ state: "error", preferencesWritten: 0 }));
  }, [session.user?.uid]);

  const selectMapEntity = useCallback(
    (id: string, kind: "hotel" | "cafe" | "transit" | "attraction") => {
      setSelectedId(id);
      if (kind === "hotel") setDetailHotelId(id);
    },
    [],
  );
  const runAgentTurn = async (
    text: string,
    context: {
      threadId: string;
      destination: string;
      hotels: HotelCandidate[];
      existingPins: typeof state.pins;
    },
  ) => {
    const userMessage: ChatMessage = { id: crypto.randomUUID(), role: "user", text };
    setMessages((current) => [...current, userMessage]);
    setChatting(true);
    setError(null);
    try {
      const pois: PoiCandidate[] = context.existingPins
        .filter((pin) => pin.kind !== "hotel")
        .map((pin) => ({
          placeId: pin.entityId,
          title: pin.title,
          latitude: pin.latitude,
          longitude: pin.longitude,
          primaryType: pin.kind,
          tags: [pin.kind],
        }));
      const response = await fetch("/api/hotel-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          threadId: context.threadId,
          message: text,
          searchContext: { destination: context.destination, hotels: context.hotels, pois },
        }),
      });
      const raw = await response.json().catch(() => null);
      if (!response.ok) throw new Error(raw?.error ?? "The AI advisor is temporarily unavailable.");
      const result = hotelChatResponseSchema.parse(raw);
      dispatch({ type: "apply-pin-operations", operations: result.pinOperations });
      dispatch({
        type: "preferences-recalled",
        preferences: result.recalledPreferences.map((item) => ({
          id: item.id,
          statement: item.statement,
        })),
      });
      setMessages((current) => [
        ...current,
        { id: crypto.randomUUID(), role: "assistant", text: result.assistantText },
      ]);
    } catch (reason) {
      const message =
        reason instanceof Error ? reason.message : "The AI advisor is temporarily unavailable.";
      setMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          text: `The map could not be updated: ${message}`,
        },
      ]);
    } finally {
      setChatting(false);
    }
  };

  const searchHotels = async () => {
    if (!session.user || !query.trim()) return;
    const searchRun = ++searchRunRef.current;
    setSearching(true);
    setError(null);
    const destination = query.trim();
    const destinationChanged = destination !== state.destination;
    const activeThreadId = destinationChanged ? crypto.randomUUID() : state.threadId;
    if (destinationChanged) {
      setHotels([]);
      dispatch({
        type: "destination-changed",
        destination,
        threadId: activeThreadId,
      });
      setMessages([]);
      setSelectedId(null);
      setDetailHotelId(null);
    }
    try {
      const response = await fetch("/api/hotels/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ q: destination, hitsPerPage: 15, page: 0, currency: "TWD" }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error("Hotel search failed. Please try again.");
      const nextHotels = (payload.hits ?? []) as HotelCandidate[];
      setHotels(nextHotels.map((hotel) => ({ ...hotel, priceStatus: "loading" as const })));
      void hydratePrices(nextHotels, searchRun);
      void runAgentTurn(
        "Use my past hotel preferences to recommend the best hotels and nearby places for this trip.",
        {
          threadId: activeThreadId,
          destination,
          hotels: nextHotels,
          existingPins: destinationChanged ? [] : state.pins,
        },
      );
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Hotel search failed. Please try again.");
    } finally {
      setSearching(false);
    }
  };

  const hydratePrices = async (baseHotels: HotelCandidate[], searchRun: number) => {
    if (baseHotels.length === 0) return;
    try {
      const response = await fetch("/api/hotel/lowest-prices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          hotelIds: baseHotels.map((hotel) => hotel.hotelId),
          checkIn: "2026-09-23",
          checkOut: "2026-09-26",
          currency: "TWD",
          adults: 2,
          children: 0,
          rooms: 1,
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error("Live prices are unavailable.");
      if (searchRun === searchRunRef.current) {
        setHotels(mergeHotelPrices(baseHotels, payload.prices ?? []));
      }
    } catch {
      if (searchRun === searchRunRef.current) {
        setHotels(baseHotels.map((hotel) => ({ ...hotel, stayPrice: null, priceStatus: "error" })));
      }
    }
  };

  const sendMessage = async (text: string) => {
    await runAgentTurn(text, {
      threadId: state.threadId,
      destination: state.destination,
      hotels,
      existingPins: state.pins,
    });
  };

  const visibleHotels = hotels.filter((hotel) => hotel.starRating >= minStars);
  const detailHotel = detailHotelId
    ? (hotels.find((hotel) => hotel.hotelId === detailHotelId) ?? null)
    : null;
  const recommendationById = new Map(
    state.pins.filter((pin) => pin.kind === "hotel").map((pin) => [pin.entityId, pin]),
  );

  return (
    <main className="experience-shell">
      <header className="floating-header">
        <a className="brand" href="/" aria-label="PickTrip Hotel Memory">
          <MapPinned size={29} fill="currentColor" />
          <strong>PickTrip</strong>
        </a>
        <nav aria-label="Primary navigation">
          <span>
            <Hotel size={20} /> Trips
          </span>
          <span className="active">
            <Bookmark size={20} /> Explore
          </span>
          <span>
            <Sparkles size={20} /> Inspiration
          </span>
        </nav>
      </header>
      <AuthControl user={session.user} loading={session.loading} onChanged={session.refresh} />

      <section className="search-rail" aria-label="Hotel search">
        <button className="round-control" type="button" aria-label="Search filters">
          <SlidersHorizontal size={21} />
        </button>
        <label className="destination-field">
          <Search size={18} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Where are you going?"
          />
        </label>
        <div className="rail-segment">
          <CalendarDays size={18} />
          <span>Sep 23 — Sep 26</span>
        </div>
        <div className="rail-segment">
          <UsersRound size={18} />
          <span>2 adults</span>
        </div>
        <button
          className="search-submit"
          type="button"
          onClick={() => void searchHotels()}
          disabled={!session.user || searching}
          aria-label="Search hotels"
        >
          {searching ? <span className="spinner" /> : <ArrowRight size={26} />}
        </button>
      </section>

      {!session.loading && !session.user ? (
        <section className="login-gate">
          <Sparkles size={28} />
          <h1>Sign in to bring your hotel preferences back to the map</h1>
          <p>
            Use your PickTrip account. Personal memory is never read or written while signed out.
          </p>
        </section>
      ) : (
        <section className="results-layout">
          <aside className="results-panel">
            <div className="results-toolbar">
              <span>
                {state.destination} · {visibleHotels.length} hotels
              </span>
              <label>
                <Filter size={15} /> Stars
                <select
                  value={minStars}
                  onChange={(event) => setMinStars(Number(event.target.value))}
                >
                  <option value={0}>All</option>
                  <option value={3}>3+</option>
                  <option value={4}>4+</option>
                  <option value={5}>5</option>
                </select>
              </label>
            </div>
            {error ? <p className="inline-error">{error}</p> : null}
            {visibleHotels.length ? (
              <div className="hotel-list">
                {visibleHotels.map((hotel) => (
                  <HotelCard
                    key={hotel.hotelId}
                    hotel={hotel}
                    recommendation={recommendationById.get(hotel.hotelId)}
                    selected={selectedId === hotel.hotelId}
                    onHighlight={() => setSelectedId(hotel.hotelId)}
                    onOpen={() => {
                      setSelectedId(hotel.hotelId);
                      setDetailHotelId(hotel.hotelId);
                    }}
                  />
                ))}
              </div>
            ) : (
              <div className="empty-results">
                <Hotel size={37} />
                <h2>{searching ? "Searching…" : "Search for a city"}</h2>
                <p>Hotel results come directly from the PickTrip Hotel API.</p>
              </div>
            )}
          </aside>
          <section className="map-panel">
            <HotelMap
              hotels={visibleHotels}
              aiPins={state.pins}
              selectedId={selectedId}
              onSelect={selectMapEntity}
            />
            {state.recalledPreferences.length || bootstrapStatus.state !== "idle" ? (
              <div className="memory-strip">
                <Sparkles size={16} />
                {state.recalledPreferences.length
                  ? `${state.recalledPreferences.length} preferences recalled`
                  : bootstrapStatus.state === "loading"
                    ? "Importing trip memories…"
                    : bootstrapStatus.state === "partial"
                      ? "Memory import partially complete"
                      : bootstrapStatus.state === "error"
                        ? "Memory import unavailable"
                        : bootstrapStatus.preferencesWritten
                          ? `${bootstrapStatus.preferencesWritten} preferences ready`
                          : "Memory ready"}
              </div>
            ) : null}
            <MultiTurnChat
              messages={messages}
              pending={chatting}
              disabled={!session.user || hotels.length === 0}
              onSend={sendMessage}
            />
          </section>
        </section>
      )}
      {detailHotel ? (
        <HotelDetailDrawer hotel={detailHotel} onClose={() => setDetailHotelId(null)} />
      ) : null}
    </main>
  );
}
