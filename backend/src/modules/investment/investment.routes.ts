import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { db } from "../../db/client";
import { pool } from "../../db/connection";
import { neighborhoodScores } from "../../db/schema";
import { toNumeric } from "../../lib/api/area-scores";
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
        schoolsScore: neighborhoodScores.schoolsScore,
        dataCoverage: neighborhoodScores.dataCoverage,
      })
      .from(neighborhoodScores)
      .where(eq(neighborhoodScores.desoId, deso_id))
      .limit(1);

    if (areaResult.length === 0) {
      return sendApiError(reply, 404, "NOT_FOUND", "Area not found");
    }

    const incomeRes = await pool.query(
      `SELECT median_income
       FROM demographics
       WHERE deso_id = $1
         AND quality IN ('measured', 'derived')
         AND median_income IS NOT NULL
       ORDER BY year DESC
       LIMIT 1`,
      [deso_id],
    );

    const areaData = areaResult[0];
    const medianIncome = toNumeric(incomeRes.rows[0]?.median_income);
    const pricePerSqm = Math.round(price / area);

    // Only figures computed from the request or from stored, measured data are returned.
    // Market benchmarks, risk and commute have no data source yet (DR-51) and are null.
    return sendApiSuccess(reply, {
      metrics: {
        pricePerSqm,
        avgPricePerSqm: null,
        marketPosition: null,
        priceToIncomeRatio: medianIncome ? Math.round((price / medianIncome) * 10) / 10 : null,
        riskScore: null,
        housingScore: toNumeric(areaData.housingMarketScore),
      },
      commute: null,
      familyScore: toNumeric(areaData.schoolsScore),
      dataCoverage: toNumeric(areaData.dataCoverage),
      unavailable: ["avgPricePerSqm", "marketPosition", "riskScore", "commute"],
    });
  });
}
