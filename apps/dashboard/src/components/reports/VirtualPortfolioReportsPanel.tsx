// Shim — delega a MonthlyReportPanel central (spec 4.3)
// Mantiene compat para Dialog legacy en VirtualPortfolioPage hasta Commit 5.
import { MonthlyReportPanel } from "@/components/portfolio/MonthlyReportPanel";

export function VirtualPortfolioReportsPanel({
  portfolioId,
}: {
  portfolioId: string;
  portfolioName?: string;
}) {
  return <MonthlyReportPanel virtualPortfolioId={portfolioId} />;
}

export default VirtualPortfolioReportsPanel;
