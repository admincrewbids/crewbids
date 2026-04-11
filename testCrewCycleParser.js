const { parseCrewCycleChartText } = require("./lib/crewCycleParser");

const text = `
WH_D 1001 Off 10001 (06:56)
03:58 - 10:54
10001 (06:56)
03:58 - 10:54
10001 (06:56)
03:58 - 10:54
10001 (06:56)
03:58 - 10:54
10001 (06:56)
03:58 - 10:54
Off 2 34:40 00:00 05:20 00:00 00:00 27:10

WH_D 1002 Off 10002 (06:54)
04:28 - 11:22
10002 (06:54)
04:28 - 11:22
10002 (06:54)
04:28 - 11:22
10002 (06:54)
04:28 - 11:22
10002 (06:54)
04:28 - 11:22
Off 2 34:30 00:00 05:30 00:00 00:00 23:45
`;

const parsedRows = parseCrewCycleChartText(text);

console.log("PARSED ROWS:");
console.log(parsedRows);