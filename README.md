# Dárky

A shared gift wish list for Bohoušek and Boženka. It's a static site for GitHub Pages, with data and photos stored in Supabase.

- Each person adds what they'd like to get: name, price, category, a link to where to buy it, a note and up to 6 photos. Photos are resized to 1600 px in the browser before upload.
- Filters: who it's for, category, price bands or an exact range, and "hide reserved". Sort by newest, price or name.
- **Koupím to**: either person can reserve a wish of the other's so they know it's taken care of. The person the wish is for never sees this; the database hides it from them.
- You can edit and delete only your own wishes.

## Demo mode
While `DB.url` in `app.js` is empty, the site runs in demo mode: no password, sample data, and everything is saved only in the current browser.

## Setting up Supabase (one time)
1. Create a new project at supabase.com. The free tier is enough. You can also use an existing project; the tables don't clash with triphub.
2. Open **SQL Editor**, paste in `gifts.sql`, **replace `CHANGE ME` with your shared password**, and run it.
3. Go to **Project Settings → API**, copy the Project URL and the `anon` public key, and put them into `app.js`:
   ```js
   const DB = { url: "https://xxxx.supabase.co", key: "eyJ…" };
   ```
4. Commit and push.

To change the password later, run this in the SQL Editor:
```sql
update gift_settings set pass_hash = crypt('new password', gen_salt('bf')) where id = 1;
```

## GitHub Pages
Repo → Settings → Pages → Source: *Deploy from a branch*, branch `main`, folder `/ (root)`.
For a custom domain, add a `CNAME` file with the domain name in it.

## Security notes
The password keeps out casual visitors, the same way as on triphub. Data is readable only through password-checked functions; direct access to the table is blocked. Photos sit in a public bucket under random file names. Deleting a wish doesn't delete its photos from storage.
