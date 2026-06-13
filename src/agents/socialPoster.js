// Meta publishing — disabled during training phase
// Returns { published, facebook, instagram }
export async function publishPost(post, imageUrl, persona) {
  console.log('Social Poster: publishing disabled during training phase.');
  return { published: false, facebook: false, instagram: false };
}
