import { getLinkEmbedKind } from './components/collabboard/LinkMediaEmbed';

const urls = [
    "https://www.youtube.com/watch?v=Gu5Pe1vkU1o",
    "https://youtu.be/Gu5Pe1vkU1o",
    "not-a-url"
];

urls.forEach(url => {
    console.log(`URL: ${url} -> Limit: ${getLinkEmbedKind(url)}`);
});
