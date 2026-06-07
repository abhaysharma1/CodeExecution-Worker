-- Remove expectedComplexity enum and field from complexityTestingCases

ALTER TABLE "complexityTestingCases" DROP COLUMN "expectedComplexity";

DROP TYPE "expectedComplexity";
