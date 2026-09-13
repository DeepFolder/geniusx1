import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';

export interface GeoEntry { country: string; city: string; count: number; }

let _names: Intl.DisplayNames | null = null;
function countryName(code: string): string {
  if (!code) return 'Unknown';
  try {
    if (!_names) _names = new Intl.DisplayNames(['en'], { type: 'region' });
    return _names.of(code.toUpperCase()) || code;
  } catch { return code; }
}

function flagEmoji(code: string): string {
  if (!code || code.length !== 2) return '🌐';
  try {
    const [a, b] = code.toUpperCase().split('');
    return String.fromCodePoint(a.codePointAt(0)! - 65 + 0x1F1E6) +
           String.fromCodePoint(b.codePointAt(0)! - 65 + 0x1F1E6);
  } catch { return '🌐'; }
}

const CONTINENT_OF: Record<string, string> = {};
for (const c of ['AD','AL','AT','BA','BE','BG','BY','CH','CY','CZ','DE','DK','EE','ES','FI','FR','GB','GR','HR','HU','IE','IS','IT','LI','LT','LU','LV','MC','MD','ME','MK','MT','NL','NO','PL','PT','RO','RS','RU','SE','SI','SK','SM','TR','UA','XK']) CONTINENT_OF[c] = 'Europe';
for (const c of ['AG','BB','BZ','CA','CR','CU','DM','DO','GD','GT','HN','HT','JM','KN','LC','MX','NI','PA','SV','TT','US','VC']) CONTINENT_OF[c] = 'N. America';
for (const c of ['AR','BO','BR','CL','CO','EC','GY','PE','PY','SR','UY','VE']) CONTINENT_OF[c] = 'S. America';
for (const c of ['AE','AF','AM','AZ','BD','BH','BN','BT','CN','GE','ID','IL','IN','IQ','IR','JP','JO','KG','KH','KP','KR','KW','KZ','LA','LB','LK','MM','MN','MY','NP','OM','PH','PK','QA','SA','SG','SY','TH','TJ','TL','TM','TW','UZ','VN','YE']) CONTINENT_OF[c] = 'Asia';
for (const c of ['AO','BF','BI','BJ','BW','CD','CF','CG','CI','CM','CV','DJ','DZ','EG','ER','ET','GA','GH','GM','GN','GW','KE','KM','LR','LS','LY','MA','MG','ML','MR','MU','MW','MZ','NA','NE','NG','RW','SC','SD','SL','SN','SO','SS','ST','SZ','TD','TG','TN','TZ','UG','ZA','ZM','ZW']) CONTINENT_OF[c] = 'Africa';
for (const c of ['AU','FJ','FM','KI','MH','NR','NZ','PG','PW','SB','TO','TV','VU','WS']) CONTINENT_OF[c] = 'Oceania';

const CONTINENT_COLORS: Record<string, string> = {
  'Europe': '#60a5fa', 'N. America': '#34d399', 'S. America': '#fbbf24',
  'Asia': '#f472b6', 'Africa': '#fb923c', 'Oceania': '#a78bfa', 'Other': '#94a3b8',
};

export function GeoStatsPanel({ data }: { data: GeoEntry[] }) {
  const countryMap = new Map<string, number>();
  for (const d of data) {
    if (d.country) countryMap.set(d.country, (countryMap.get(d.country) || 0) + d.count);
  }
  const countries = Array.from(countryMap.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([code, count]) => ({
      code, count,
      name: countryName(code),
      flag: flagEmoji(code),
      continent: CONTINENT_OF[code.toUpperCase()] || 'Other',
    }));

  const continentMap = new Map<string, number>();
  for (const { continent, count } of countries) {
    continentMap.set(continent, (continentMap.get(continent) || 0) + count);
  }
  const continentData = Array.from(continentMap.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([name, count]) => ({ name, count }));

  const total = countries.reduce((s, c) => s + c.count, 0) || 1;

  if (data.length === 0 || countries.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
        <span className="text-2xl">📍</span>
        <p className="text-sm font-medium">No location data yet</p>
        <p className="text-xs text-center max-w-xs">Location is captured from CDN geo headers. Data will appear automatically once searches arrive in production.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-3">By Continent</p>
        <ResponsiveContainer width="100%" height={continentData.length * 36 + 16}>
          <BarChart data={continentData} layout="vertical" margin={{ left: 8, right: 40, top: 0, bottom: 0 }}>
            <XAxis type="number" hide />
            <YAxis type="category" dataKey="name" width={90} tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
            <Tooltip
              cursor={{ fill: 'hsl(var(--muted)/0.3)' }}
              contentStyle={{ background: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', borderRadius: 6, fontSize: 12 }}
              formatter={(v: number) => [`${v} searches (${((v / total) * 100).toFixed(1)}%)`, '']}
            />
            <Bar dataKey="count" radius={[0, 4, 4, 0]} label={{ position: 'right', fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}>
              {continentData.map(entry => (
                <Cell key={entry.name} fill={CONTINENT_COLORS[entry.name] || '#94a3b8'} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-3">By Country</p>
        <div className="rounded-md border border-border overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th className="text-left px-3 py-2 text-muted-foreground font-medium">Country</th>
                <th className="text-left px-3 py-2 text-muted-foreground font-medium hidden sm:table-cell">Continent</th>
                <th className="text-right px-3 py-2 text-muted-foreground font-medium">Searches</th>
                <th className="text-right px-3 py-2 text-muted-foreground font-medium w-20 hidden sm:table-cell">Share</th>
                <th className="px-3 py-2 w-24 hidden md:table-cell" />
              </tr>
            </thead>
            <tbody>
              {countries.map(({ code, count, name, flag, continent }, i) => {
                const pct = (count / total) * 100;
                return (
                  <tr key={code} className={i % 2 === 0 ? 'bg-background' : 'bg-muted/20'}>
                    <td className="px-3 py-2">
                      <span className="inline-flex items-center gap-1.5">
                        <span className="text-base leading-none">{flag}</span>
                        <span className="text-foreground">{name}</span>
                      </span>
                    </td>
                    <td className="px-3 py-2 hidden sm:table-cell">
                      <span className="inline-flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full shrink-0" style={{ background: CONTINENT_COLORS[continent] || '#94a3b8' }} />
                        <span className="text-muted-foreground">{continent}</span>
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-foreground">{count}</td>
                    <td className="px-3 py-2 text-right text-muted-foreground hidden sm:table-cell">{pct.toFixed(1)}%</td>
                    <td className="px-3 py-2 hidden md:table-cell">
                      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: CONTINENT_COLORS[continent] || '#94a3b8' }} />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
