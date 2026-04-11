import { supabase } from "@/lib/supabase";
import CrewBidClient from "../components/CrewBidClient";

type SearchParams = Promise<{
  sort?: string;
  terminal?: string;
  ot?: string;
  hours?: string;
  van?: string;
}>;

export default async function Home({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const sort = params.sort || "created_at";
  const prefOT = Number(params.ot ?? 3);
  const prefHours = Number(params.hours ?? 3);
  const prefVan = Number(params.van ?? 3);
  const terminal = params.terminal || "all";

  async function addCrew(formData: FormData) {
    "use server";

    await supabase.from("crews").insert([
  {
    crew_number: formData.get("crew_number"),
    terminal: formData.get("terminal"),
    on_duty: formData.get("on_duty"),
    off_duty: formData.get("off_duty"),
    operating_hours_daily: Number(formData.get("operating_hours_daily")),
    van_hours_daily: Number(formData.get("van_hours_daily")),
    operating_hours_weekly: Number(formData.get("operating_hours_weekly")),
    overtime_hours_weekly: Number(formData.get("overtime_hours_weekly")),
    total_paid_hours_weekly: Number(formData.get("total_paid_hours_weekly")),
    notes: formData.get("notes"),
  },
]);
  }

  const allowedSorts = [
    "created_at",
    "overtime_hours_weekly",
    "total_paid_hours_weekly",
    "operating_hours_daily",
    "van_hours_daily",
    "best",
  ];

  const sortColumn = allowedSorts.includes(sort) ? sort : "created_at";

  const { data, error } = await supabase.from("crews").select("*");

  const crewsWithScore = (data || []).map((crew) => {
    const score =
      (Number(crew.overtime_hours_weekly) || 0) * prefOT +
      (Number(crew.total_paid_hours_weekly) || 0) * 1 -
      (Number(crew.operating_hours_daily) || 0) * prefHours -
      (Number(crew.van_hours_daily) || 0) * prefVan;

    return { ...crew, score };
  });

  let sortedCrews;

  if (sortColumn === "best") {
    sortedCrews = crewsWithScore.sort((a, b) => b.score - a.score);
  } else {
    sortedCrews = crewsWithScore.sort((a, b) => {
      const aVal = Number(a[sortColumn as keyof typeof a]) || 0;
      const bVal = Number(b[sortColumn as keyof typeof b]) || 0;
      return bVal - aVal;
    });
  }

  return (
  <CrewBidClient
    crews={sortedCrews || []}
    errorMessage={error?.message || null}
  />
);
}