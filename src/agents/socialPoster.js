import axios from 'axios';

const PAGE_TOKEN = process.env.META_PAGE_ACCESS_TOKEN;
const PAGE_ID = process.env.FACEBOOK_PAGE_ID;
const IG_ACCOUNT_ID = process.env.INSTAGRAM_ACCOUNT_ID;
const GRAPH = 'https://graph.facebook.com/v25.0';

async function postToFacebook(text, imageUrl) {
  const res = await axios.post(`${GRAPH}/${PAGE_ID}/photos`, null, {
    params: {
      url: imageUrl,
      caption: text,
      access_token: PAGE_TOKEN
    }
  });
  return res.data.post_id || res.data.id;
}

async function postToInstagram(text, imageUrl) {
  // Step 1: create media container
  const container = await axios.post(`${GRAPH}/${IG_ACCOUNT_ID}/media`, null, {
    params: {
      image_url: imageUrl,
      caption: text,
      access_token: PAGE_TOKEN
    }
  });
  const creationId = container.data.id;

  // Step 2: publish the container
  const publish = await axios.post(`${GRAPH}/${IG_ACCOUNT_ID}/media_publish`, null, {
    params: {
      creation_id: creationId,
      access_token: PAGE_TOKEN
    }
  });
  return publish.data.id;
}

export async function publishPost(post, imageUrl, persona) {
  if (!PAGE_TOKEN || !PAGE_ID) {
    console.log('Social Poster: META credentials not set, skipping.');
    return { published: false, facebook: false, instagram: false };
  }

  if (!imageUrl) {
    console.log('Social Poster: no image URL, skipping.');
    return { published: false, facebook: false, instagram: false };
  }

  let facebookId = null;
  let instagramId = null;

  try {
    facebookId = await postToFacebook(post, imageUrl);
    console.log(`Facebook post published: ${facebookId}`);
  } catch (e) {
    console.error('Facebook publish failed:', e.response?.data || e.message);
  }

  try {
    instagramId = await postToInstagram(post, imageUrl);
    console.log(`Instagram post published: ${instagramId}`);
  } catch (e) {
    console.error('Instagram publish failed:', e.response?.data || e.message);
  }

  return {
    published: !!(facebookId || instagramId),
    facebook: !!facebookId,
    instagram: !!instagramId
  };
}
