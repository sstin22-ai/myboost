// MyBoost Daily Auto-Growth Cron
// Deployed as Vercel serverless function
// Called by cron-job.org at 7:00 AM daily
// POST /api/cron with header x-cron-secret

const PEAKERR_URL = 'https://peakerr.com/api/v2';

const AUTO_PACKAGES = {
  instagram: {
    followers: { svc: '36642', qty: 100 },
    likes:     { svc: '36642', qty: 200 },
    comments:  { svc: '26586', qty: 5   },
  },
  facebook: {
    followers: { svc: '20931', qty: 100 },
    likes:     { svc: '32133', qty: 200 },
  },
  youtube: {
    subscribers: { svc: '18463', qty: 50  },
    likes:       { svc: '18463', qty: 100 },
  },
  tiktok: {
    followers: { svc: '31820', qty: 100  },
    likes:     { svc: '31820', qty: 200  },
    views:     { svc: '31859', qty: 1000 },
  },
};

async function sendTopeakerr(key, svc, link, qty) {
  const url = `${PEAKERR_URL}?key=${key}&action=add&service=${svc}&link=${encodeURIComponent(link)}&quantity=${qty}`;
  const res = await fetch(url);
  const data = await res.json();
  return data;
}

export default async function handler(req, res) {
  // Security — reject requests without the secret header
  const secret = req.headers['x-cron-secret'];
  if (secret !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const PEAKERR_KEY = process.env.PEAKERR_KEY;
  if (!PEAKERR_KEY) {
    return res.status(500).json({ error: 'PEAKERR_KEY not configured' });
  }

  // Load members from Vercel KV (persistent storage)
  let members = [];
  try {
    const { kv } = await import('@vercel/kv');
    members = (await kv.get('mb_users')) || [];
  } catch (e) {
    return res.status(500).json({ error: 'Could not load members: ' + e.message });
  }

  const today = new Date().toISOString().slice(0, 10);
  const results = [];

  const activeMembers = members.filter(
    u => u.planStatus === 'active' && u.urls && u.urls.length > 0
  );

  for (const member of activeMembers) {
    // Skip if already ran today
    if (member.lastRun === today) {
      results.push({ member: member.name, status: 'skipped — already ran today' });
      continue;
    }

    const memberResults = [];

    for (const url of member.urls) {
      const pkgs = AUTO_PACKAGES[url.platform];
      if (!pkgs) continue;

      for (const [type, pkg] of Object.entries(pkgs)) {
        try {
          const data = await sendTopeakerr(PEAKERR_KEY, pkg.svc, url.url, pkg.qty);
          memberResults.push({
            platform: url.platform,
            type,
            qty: pkg.qty,
            url: url.url,
            order: data.order || null,
            status: data.order ? 'processing' : 'pending',
          });
          // Small delay between requests
          await new Promise(r => setTimeout(r, 300));
        } catch (e) {
          memberResults.push({ platform: url.platform, type, status: 'error', error: e.message });
        }
      }
    }

    // Update lastRun timestamp
    member.lastRun = today;
    results.push({ member: member.name, orders: memberResults });
  }

  // Save updated members back to KV
  try {
    const { kv } = await import('@vercel/kv');
    await kv.set('mb_users', members);

    // Log activity
    const existingActivity = (await kv.get('mb_activity')) || [];
    const newActivity = results
      .filter(r => r.orders)
      .flatMap(r =>
        r.orders.map(o => ({
          id: 'a' + Date.now() + Math.random(),
          userId: activeMembers.find(u => u.name === r.member)?.id,
          userName: r.member,
          platform: o.platform,
          type: o.type,
          qty: o.qty,
          url: o.url,
          status: o.status,
          fulfillment: 'auto',
          date: today,
          peakerr_id: o.order?.toString() || null,
        }))
      );
    await kv.set('mb_activity', [...newActivity, ...existingActivity].slice(0, 500));
  } catch (e) {
    console.error('KV save error:', e.message);
  }

  return res.status(200).json({
    success: true,
    date: today,
    membersProcessed: activeMembers.length,
    results,
  });
}
