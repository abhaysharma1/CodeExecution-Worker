//   let complexityCases: ComplexityCase[] = [];

//   const complexityCasesGenerator = await prisma.problemTestGenerator.findUnique(
//     {
//       where: {
//         problemId: problem.id,
//       },
//     },
//   );

//   if (!complexityCasesGenerator) {
//     return NextResponse.json(
//       { error: "Couldn't find complexity generator" },
//       { status: 500 },
//     );
//   }

//   // Only ARRAY supported for now (safe + explicit)
//   if (complexityCasesGenerator.type !== "ARRAY") {
//     return NextResponse.json(
//       { error: "Unsupported complexity generator type" },
//       { status: 500 },
//     );
//   }

//   for (const size of complexityCasesGenerator.sizes) {
//     const arr = generateArray(
//       size,
//       complexityCasesGenerator.minValue,
//       complexityCasesGenerator.maxValue,
//       complexityCasesGenerator.pattern,
//     );

//     const input = `${size}\n${arr.join(" ")}`;

//     complexityCases.push({ input });
//   }

//   // Safety: need at least 3 runs for ratios
//   if (complexityCases.length < 3) {
//     return NextResponse.json(
//       { error: "Not enough complexity cases" },
//       { status: 422 },
//     );
//   }

//   // ------------------ Run complexity tests ------------------

//   const times: number[] = [];

//   // Optional warmup run (discard result)
//   await axios.post(
//     `${JUDGE0_DOMAIN}/submissions`,
//     {
//       language_id: languageId,
//       source_code: encodeBase64(finalCode),
//       stdin: encodeBase64(complexityCases[0].input),
//     },
//     {
//       params: { base64_encoded: "true", wait: "true" },
//       headers: { "X-AUTH_TOKEN": JUDGE0_API_KEY },
//     },
//   );

//   for (const c of complexityCases) {
//     const res = await axios.post<{ time: string }>(
//       `${JUDGE0_DOMAIN}/submissions`,
//       {
//         language_id: languageId,
//         source_code: encodeBase64(finalCode),
//         stdin: encodeBase64(c.input),
//       },
//       {
//         params: { base64_encoded: "true", wait: "true" },
//         headers: { "X-AUTH_TOKEN": JUDGE0_API_KEY },
//       },
//     );

//     const t = Number(res.data.time);
//     times.push(Number.isFinite(t) ? t : 0);
//   }

//   if (times.some((t) => t <= 0)) {
//     return NextResponse.json(
//       { error: "Unstable complexity measurement" },
//       { status: 422 },
//     );
//   }

//   // ------------------ Complexity analysis ------------------

//   const r1 = times[1] / times[0];
//   const r2 = times[2] / times[1];

//   const { complexity } = classifyComplexity(r1, r2);

//   // expectedComplexity can be null
//   const expectedKey =
//     (complexityCasesGenerator.expectedComplexity as keyof typeof ranges) ??
//     ("EXP" as keyof typeof ranges);

//   const curr = ranges[complexity as keyof typeof ranges].idx;
//   const exp = ranges[expectedKey].idx;

//   const status = curr > exp ? "BAD_SCALING" : "ACCEPTED";

//   // ------------------ Persist result ------------------

//   await prisma.selfSubmission.create({
//     data: {
//       code,
//       language: getLanguageNameById(languageId),
//       noOfPassedCases: passed,
//       userId: session.user.id,
//       problemId: questionId,
//       status,
//     },
//   });

//   return NextResponse.json(
//     {
//       status,
//       noOfPassedCases: passed,
//       totalCases: functionalCases.length,
//       totalTimeTaken: totalTime,
//       totalMemoryUsed: totalMemory,
//       yourTimeComplexity: complexity,
//       expectedTimeComplexity: complexityCasesGenerator.expectedComplexity,
//     },
//     { status: status === "ACCEPTED" ? 201 : 200 },
//   );
// }

// const ranges = {
//   LOGN: { min: 0, max: 1.3, idx: 0 },
//   N: { min: 1.3, max: 1.8, idx: 1 },
//   NLOGN: { min: 1.8, max: 2.6, idx: 2 },
//   N2: { min: 2.6, max: 4.5, idx: 3 },
//   N3: { min: 4.5, max: 7.5, idx: 4 },
//   EXP: { min: 7.5, max: Infinity, idx: 5 },
// };

// function classifyComplexity(r1: number, r2: number) {
//   if (Math.abs(r1 - r2) / Math.max(r1, r2) > 0.4) {
//     return { complexity: "EXP" };
//   }

//   const avg = (r1 + r2) / 2;

//   for (const [k, v] of Object.entries(ranges)) {
//     if (avg >= v.min && avg < v.max) {
//       return { complexity: k as keyof typeof ranges };
//     }
//   }

//   return { complexity: "EXP" };
// }

// function generateArray(
//   size: number,
//   min: number,
//   max: number,
//   pattern: GeneratorPattern,
// ): number[] {
//   let arr = Array.from(
//     { length: size },
//     () => Math.floor(Math.random() * (max - min + 1)) + min,
//   );

//   if (pattern === "SORTED") arr.sort((a, b) => a - b);
//   if (pattern === "REVERSE") arr.sort((a, b) => b - a);
//   if (pattern === "CONSTANT") arr.fill(arr[0]);

//   return arr;
// }