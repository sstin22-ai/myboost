// MyBoost Sync Endpoint
// Called from admin panel "Sync to Cloud" button
// Stores member + activity data in Vercel KV for cron to use

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const secret = req.headers['x-cron-secret'];
  if (secret !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { users, activity } = req.body;
  if (!users || !Array.isArray(users)) {
    return res.status(400).json({ error: 'Invalid data' });
  }

  try {
    const { kv } = await import('@vercel/kv');
    await kv.set('mb_users', users);
    if (activity) await kv.set('mb_activity', activity);
    return res.status(200).json({ success: true, members: users.length });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
