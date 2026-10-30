import { departmentLabel } from "../core/permissions.js";
import { state } from "../core/state.js";
import { $, escapeHtml } from "../ui/helpers.js";
// ---------- ADMIN REPORTS ----------
export function reportBarChart(groups, color) {
  const maximum = Math.max(1, ...groups.map(g => g[1]));
  return '<div class="report-bars" role="list">' + groups.map(([label, count]) => '<div class="report-bar-item" role="listitem"><div><span>' + escapeHtml(label) + '</span><strong>' + count + '</strong></div><div class="report-bar-track" aria-hidden="true"><span style="width:' + count / maximum * 100 + '%;background:' + color + '"></span></div></div>').join("") + '</div>';
}
export function requestVolumeChart(list, start, end, monthly) {
  const buckets = [];
  const cursor = new Date(start);
  cursor.setHours(0, 0, 0, 0);
  if (monthly) cursor.setDate(1);
  while (cursor <= end) {
    buckets.push({
      date: new Date(cursor),
      count: 0
    });
    monthly ? cursor.setMonth(cursor.getMonth() + 1) : cursor.setDate(cursor.getDate() + 1);
  }
  const key = d => monthly ? d.getFullYear() + "-" + d.getMonth() : d.getFullYear() + "-" + d.getMonth() + "-" + d.getDate();
  const counts = new Map();
  for (const t of list) {
    const k = key(new Date(t.created_at));
    counts.set(k, (counts.get(k) || 0) + 1);
  }
  for (const b of buckets) b.count = counts.get(key(b.date)) || 0;
  const max = Math.max(1, ...buckets.map(b => b.count)),
    width = 640,
    height = 230,
    left = 40,
    right = 620,
    top = 20,
    bottom = 185;
  const x = i => left + (right - left) * i / Math.max(1, buckets.length - 1),
    y = n => bottom - (bottom - top) * n / max;
  const points = buckets.map((b, i) => x(i) + ',' + y(b.count)).join(' ');
  const ticks = [...new Set([0, Math.ceil(max / 2), max])];
  const grid = ticks.map(n => '<line x1="' + left + '" y1="' + y(n) + '" x2="' + right + '" y2="' + y(n) + '" stroke="#e5e7eb"/><text x="28" y="' + (y(n) + 4) + '" text-anchor="end">' + n + '</text>').join('');
  const labelIndices = [...new Set([0, Math.floor((buckets.length - 1) / 2), buckets.length - 1])];
  const labels = labelIndices.map(i => '<text x="' + x(i) + '" y="212" text-anchor="' + (i === 0 ? 'start' : i === buckets.length - 1 ? 'end' : 'middle') + '">' + escapeHtml(buckets[i].date.toLocaleDateString(undefined, monthly ? {
    month: "short",
    year: "numeric"
  } : {
    month: "short",
    day: "numeric"
  })) + '</text>').join('');
  const total = list.length,
    description = total + ' requests submitted. Peak ' + (monthly ? 'monthly' : 'daily') + ' volume: ' + max + '.';
  return '<svg class="report-line-chart" viewBox="0 0 ' + width + ' ' + height + '" role="img" aria-label="' + escapeHtml(description) + '"><title>Request volume</title><desc>' + escapeHtml(description) + '</desc>' + grid + '<polyline points="' + points + '" fill="none" stroke="#2563eb" stroke-width="3" stroke-linejoin="round"/>' + buckets.map((b, i) => '<circle cx="' + x(i) + '" cy="' + y(b.count) + '" r="3" fill="#2563eb"><title>' + escapeHtml(b.date.toLocaleDateString()) + ': ' + b.count + ' requests</title></circle>').join('') + labels + '</svg>';
}
export function renderReports() {
  const period = $("reportPeriod").value || "30",
    end = new Date(),
    start = new Date(end);
  start.setHours(0, 0, 0, 0);
  if (period !== "all") start.setDate(start.getDate() - (Number(period) - 1));
  const valid = state.tickets.filter(t => Number.isFinite(new Date(t.created_at).getTime()) && new Date(t.created_at) <= end);
  if (period === "all" && valid.length) {
    start.setTime(Math.min(...valid.map(t => new Date(t.created_at).getTime())));
    start.setHours(0, 0, 0, 0);
  }
  const list = valid.filter(t => new Date(t.created_at) >= start);
  $("reportSummary").textContent = list.length + (list.length === 1 ? " request submitted" : " requests submitted") + " · " + (period === "all" ? "All time" : "Last " + period + " days");
  $("reportsEmpty").classList.toggle("hidden", list.length > 0);
  $("reportBreakdown").classList.toggle("hidden", list.length === 0);
  if (!list.length) {
    $("reportVolumeChart").innerHTML = "";
    $("reportDepartmentChart").innerHTML = "";
    $("reportConcernChart").innerHTML = "";
    return;
  }
  const monthly = period === "all" && end - start > 90 * 86400000;
  $("volumeCaption").textContent = "Requests submitted " + (monthly ? "each month." : "each day.");
  $("reportVolumeChart").innerHTML = requestVolumeChart(list, start, end, monthly);
  const group = key => {
    const counts = new Map();
    for (const t of list) {
      const label = key(t);
      counts.set(label, (counts.get(label) || 0) + 1);
    }
    return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  };
  $("reportDepartmentChart").innerHTML = reportBarChart(group(t => departmentLabel(t.department)), "#2563eb");
  $("reportConcernChart").innerHTML = reportBarChart(group(t => t.concern || "Concern not recorded").slice(0, 5), "#14b8a6");
}
export function initReports() {
  $("reportPeriod").addEventListener("change", renderReports);
}
