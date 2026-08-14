/* 一次性种子灌库：调用 tRPC park.admin.seedDb（走本地 dev server） */
const res = await fetch("http://localhost:3000/api/trpc/park.admin.seedDb", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ json: null }),
});
const data = await res.json();
console.log(JSON.stringify(data, null, 2));
