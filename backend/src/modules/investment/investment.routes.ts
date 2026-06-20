import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { db } from "../../db/client";
import { demographics, neighborhoodScores } from "../../db/schema";
import { sendApiError, sendApiSuccess } from "../../lib/api/contracts";
import { parseOrReply } from "../../lib/api/validation";

export async function investmentRoutes(fastify: FastifyInstance, _options: object) {
  fastify.post("/analyze", async (request, reply) => {
    const parsed = parseOrReply(
      z.object({
        price: z.number().positive(),
        area: z.number().positive(),
        fee: z.number().nonnegative().optional(),
        deso_id: z.string().min(1),
      }),
      request.body,
      reply,
    );
    if (!parsed) {
      return;
    }

    const { price, area, deso_id } = parsed;

    if (!price || !area || !deso_id) {
      return sendApiError(reply, 400, "BAD_REQUEST", "Missing required fields");
    }

    const areaResult = await db
      .select({
        housingMarketScore: neighborhoodScores.housingMarketScore,
        futureGrowthScore: neighborhoodScores.futureGrowthScore,
        schoolsScore: neighborhoodScores.schoolsScore,
      })
      .from(neighborhoodScores)
      .where(eq(neighborhoodScores.desoId, deso_id))
      .limit(1);

    const medianIncomeResult = await db
      .select({ medianIncome: demographics.medianIncome })
      .from(demographics)
      .where(eq(demographics.desoId, deso_id))
      .limit(1);

    if (areaResult.length === 0) {
      return sendApiError(reply, 404, "NOT_FOUND", "Area not found");
    }

    const areaData = areaResult[0];
    const medianIncome = medianIncomeResult[0]?.medianIncome ?? 0;
    const pricePerSqm = Math.round(price / area);

    const housingScore = Number(areaData.housingMarketScore ?? 0);
    const growthScore = Number(areaData.futureGrowthScore ?? 0);
    const schoolsScore = Number(areaData.schoolsScore ?? 0);

    const avgPricePerSqm = housingScore > 75 ? 65000 : 55000;
    const diff = ((pricePerSqm - avgPricePerSqm) / avgPricePerSqm) * 100;
    const marketPosition = diff > 5 ? "Above average" : diff < -5 ? "Below average" : "Average";

    const affordability = medianIncome > 0 && price / medianIncome < 7 ? "Affordable" : "Premium";

    const riskScore = growthScore >= 85 ? 25 : growthScore >= 70 ? 45 : 65;

    return sendApiSuccess(reply, {
      metrics: {
        pricePerSqm,
        avgPricePerSqm,
        marketPosition,
        affordability,
        riskScore,
        housingScore,
      },
      commute: {
        train: 18,
        car: 21,
        bike: 42,
        score: 89,
      },
      familyScore: schoolsScore,
    });
  });
}
