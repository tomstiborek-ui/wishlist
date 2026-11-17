# Dárky

A shared gift wish list for Bohoušek and Boženka. It's a static site for GitHub Pages, with data and photos stored in Supabase.

- No login: anyone with the link can see and edit the list (the site is hidden from search engines).
- When you add a wish, you pick who it's for (Bohoušek / Boženka) and fill in the name, price, category, a link to where to buy it, a note and up to 6 photos. Photos are resized to 1600 px in the browser before upload.
- Filters: who it's for, category, price bands or an exact range. Sort by newest, price or name.
- Anyone can edit and delete any wish.

## Demo mode
While `DB.url` in `app.js` is empty, the site runs in demo mode: no password, sample data, and everything is saved only in the current browser.

## Setting up Supabase (one time)
1. Create a new project at supabase.com. The free tier is enough. You can also use an existing project; the tables don't clash with triphub.
2. Open **SQL Editor**, paste in `gifts.sql` and run it.
3. Go to **Project Settings → API**, copy the Project URL and the `anon` public key, and put them into `app.js`:
   ```js
   const DB = { url: "https://xxxx.supabase.co", key: "eyJ…" };
   ```
4. Commit and push.

To add a password later, run `update gift_settings set pass_hash = crypt('password', gen_salt('bf')) where id = 1;` and bring back the login screen (see the git history).

## GitHub Pages
Repo → Settings → Pages → Source: *Deploy from a branch*, branch `main`, folder `/ (root)`.
For a custom domain, add a `CNAME` file with the domain name in it.

## Security notes
There's no password, so the list is protected only by nobody knowing the address. Direct access to the table is blocked; everything goes through the database functions. Photos sit in a public bucket under random file names. Deleting a wish doesn't delete its photos from storage.
