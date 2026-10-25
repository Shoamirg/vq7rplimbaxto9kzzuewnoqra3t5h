import { JobDetail } from "@/components/workshop/job-detail";

export const dynamic = "force-dynamic";

export default async function WorkshopJobPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <JobDetail jobId={id} />;
}
