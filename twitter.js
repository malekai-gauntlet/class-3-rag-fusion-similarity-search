export async function getTweetMetadata(tweetId) {
    try {
        const tweetUrl = `https://twitter.com/i/web/status/${tweetId}`;
        const encodedUrl = encodeURIComponent(tweetUrl);
        const oembedUrl = `https://publish.twitter.com/oembed?url=${encodedUrl}&omit_script=true`;

        const response = await fetch(oembedUrl);
        const data = await response.json();

        if (!data) {
            throw new Error('Tweet not found');
        }

        // Extract author name and tweet text from the HTML
        const authorMatch = data.html.match(/&mdash; (.*?) \(@.*?\)/);
        const author = authorMatch ? authorMatch[1] : 'Unknown Author';
        
        // Extract tweet text (everything before the mdash)
        const textMatch = data.html.match(/<p.*?>(.*?)<\/p>/);
        const text = textMatch 
            ? textMatch[1]
                .replace(/<.*?>/g, '') // Remove HTML tags
                .replace(/&amp;/g, '&') // Replace HTML entities
                .replace(/&quot;/g, '"')
                .replace(/&#39;/g, "'")
            : '';

        return {
            text,
            author,
            html: data.html // Include the full HTML for optional use
        };
    } catch (error) {
        console.error('Error fetching tweet:', error);
        throw error;
    }
} 