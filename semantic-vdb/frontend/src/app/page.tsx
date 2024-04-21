'use client';
import { SetStateAction, useState } from 'react';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import Grid from '@mui/material/Grid';
import Paper from '@mui/material/Paper';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import CardActionArea from '@mui/material/CardActionArea';
import Carousel from 'react-material-ui-carousel';
import ForceGraph2D from 'react-force-graph-2d';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';

import Wordcloud from '@visx/wordcloud/lib/Wordcloud';
import { scaleLog } from '@visx/scale';

// import material ui icon for songs
import MusicNoteIcon from '@mui/icons-material/MusicNote';
import SearchIcon from '@mui/icons-material/Search';
import InfoIcon from '@mui/icons-material/Info';
import ScatterPlotIcon from '@mui/icons-material/ScatterPlot';
import LibraryMusicIcon from '@mui/icons-material/LibraryMusic';

// change the primary color of the material ui theme
import { createTheme, ThemeProvider } from '@mui/material/styles';
import { Icon } from '@mui/material';

// define the primary color with all the shades
const theme = createTheme({
  palette: {
    primary: {
      main: '#729B72',
    },
    secondary: {
      main: '#729B72',
    },
  },
});


export default function Page(): JSX.Element {
  // set up the variables for the page
  const [searchTerm, setSearchTerm] = useState('');
  const [topKSearch, setTopKSearch] = useState(10);
  const [topKGraph, setTopKGraph] = useState(20);
  const [sizeGraph, setSizeGraph] = useState(15);
  const [treshold, setTreshold] = useState(0.1);
  const [detailSongData, setDetailSongData] = useState<any[]>([]);
  const [graphData, setGraphData] = useState<{ nodes: any[], links: any[] }>({ nodes: [], links: [] });
  const [wordCloudData, setWordCloudData] = useState<{ text: string, value: number }[]>([]);
  const [canasWidth, setCanvasWidth] = useState(0);
  const [canvasHeight, setCanvasHeight] = useState(0);

  // define stopwords
  const stopwords = [
    "i", "me", "my", "myself", "we", "our", "ours", "ourselves", "you", "your", "yours",
    "yourself", "yourselves", "he", "him", "his", "himself", "she", "her", "hers",
    "herself", "it", "its", "itself", "they", "them", "their", "theirs", "themselves",
    "what", "which", "who", "whom", "this", "that", "these", "those", "am", "is", "are",
    "was", "were", "be", "been", "being", "have", "has", "had", "having", "do", "does",
    "did", "doing", "a", "an", "the", "and", "but", "if", "or", "because", "as", "until",
    "while", "of", "at", "by", "for", "with", "about", "against", "between", "into",
    "through", "during", "before", "after", "above", "below", "to", "from", "up", "down",
    "in", "out", "on", "off", "over", "under", "again", "further", "then", "once", "here",
    "there", "when", "where", "why", "how", "all", "any", "both", "each", "few", "more",
    "most", "other", "some", "such", "no", "nor", "not", "only", "own", "same", "so",
    "than", "too", "very", "s", "t", "can", "will", "just", "don", "should", "now",
    "dont", "shouldnt", "now", "d", "ll", "m", "o", "re", "ve", "y", "ain", "aren",
    "couldn", "didn", "doesn", "hadn", "hasn", "haven", "isn", "ma", "mightn", "mustn",
    "cant", "couldnt", "didnt", "doesnt", "hadnt", "hasnt", "havent", "isnt", "mightnt",
    "mustnt", "neednt", "shant", "shouldnt", "wasnt", "werent", "wont", "wouldnt",
    "im", "youre", "hes", "shes", "its", "were", "theyre", "ive", "youve", "weve",
    "yas", "yall", "youd", "hed", "shed", "theyd", "weve", "youve", "theyve", "ive",
    "oh", "ah", "eh", "uh", "um", "hmm", "huh", "ha", "heh", "haha", "hahaha", "hahahaha",
    "ya", "yo", "yolo"
  ];


  // variable to store search results
  const [searchResults, setSearchResults] = useState<{ [key: string]: { 
    payload: { 
      artist_name: string,
      track_name: string,
      track_uri: string,
      topic_words: string,
      topic_probs: string,
      topic_id: number
    }, 
    score: number } 
  }>({});

  // variable to store search result keys
  const [searchResultKeys, setSearchResultKeys] = useState<string[]>([]);

  // function to colorscale the search results according to the score
  // score is a number between 0 and 0.6
  const colorScale = (score: number) => {
    const red = Math.floor(255 * (0.7  - score));
    const green = Math.floor(255 * (score));
    // make the colors a bit brighter
    return `rgb(${red + 50}, ${green + 50}, 0)`;
  }

  // function that colors nodes by topic
  // there are 20 topics
  const topicColor = (topic_id: number) => {
    const colors = [
      '#32296E', '#6AA443', '#8880CE', '#3B9558', '#B074C9',
      '#439D3F', '#8DB0D3', '#C468A8', '#348286', '#E3E7BF',
      '#305E7E', '#BA854F', '#99D8D2', '#2C3D76', '#BF5B65',
      '#378D72', '#ECDCCB', '#A6DDB7', '#C0E2B2', '#94AB47',
  ] ;
    return colors[topic_id];
  }

  // function that calls the API to search for lyrics
  // api runs at /api/search on address  Uvicorn running on http://0.0.0.0:8000
  const searchLyrics = async (searchTerm: string, topKSearch: number) => {
    console.log("Searching for lyrics: ", searchTerm);
    const response = await fetch(`http://localhost:6555/api/search?query=${searchTerm}&top_k=${topKSearch}`);
    const data = await response.json();
    const keys = Object.keys(data);
    const sortedKeys = keys.sort((a, b) => {
        return data[b].score - data[a].score;
      }
    );
    setSearchResults(data);
    setSearchResultKeys(sortedKeys);
  };

  // function to count word frequency
  function wordFreq(text: string) {
    // text to lowercase
    text = text.toLowerCase();
    const words: string[] = text.split(/\W+/);
    // remove stopwords
    const filteredWords = words.filter(word => !stopwords.includes(word));
    const freqMap: { [key: string]: number } = {};
    for (let w of filteredWords) {
        if (w) { // This checks to ignore empty strings that might result from split
            freqMap[w] = (freqMap[w] || 0) + 1;
        }
    }
    // sort and rstrict to top 30
    const items = Object.keys(freqMap).map(function(key) {
        return [key, freqMap[key]];
    });

    items.sort(function(first, second) {
        return second[1] - first[1];
    });

    const freqMapSorted: { [key: string]: number } = {};
    items.slice(0, 50).forEach(function(item) {
        freqMapSorted[item[0]] = item[1];
    });

    return freqMapSorted;
  };

  // function to scale the font size of the wordcloud
  const minValue = Math.min(...wordCloudData.map(d => d.value));
  const maxValue = Math.max(...wordCloudData.map(d => d.value));

  // scale the font size of the wordcloud
  const fontScaler = scaleLog({
    domain: [minValue, maxValue],
    range: [10, 100],
  });

  // function to scale the font size of the wordcloud
  const fontSizeSetter = (datum: { value: number; }) => {
    return fontScaler(datum.value);
  }

  // function to generate a fixed value for the wordcloud
  const fixedValueGenerator = () => 0.5;

  // colors for the wordcloud
  const wordColors = ['#556B2F', '#8FBC8F', '#D3D3D3'];

  // function to retrieve graph data
  const graphRetrieval = async (Key: string, topKGraph: number, 
                                sizeGraph: number, treshold: number) => {
    console.log("Retrieving graph data for key: ", Key);
    const response = await fetch(`http://localhost:6555/api/graph?key=${Key}&top_k=${topKGraph}&size=${sizeGraph}&treshold=${treshold}`);
    const data = await response.json();
    const nodes = data.nodes;
    const links = data.edges;
    const graphData = data.node_data;

    const nodesNew = nodes.map((node: any) => {
      return {
        id: node,
        name: `${graphData[node].track_name} - ${graphData[node].artist_name}`,
        val: 1,
        data: {
          topic_id: graphData[node].topic_id,
          topic_words: graphData[node].topic_words,
          topic_probs: graphData[node].topic_probs,
          Lyrics: graphData[node].lyrics,
          duration: graphData[node].duration,
          artist_name: graphData[node].artist_name,
          track_uri: graphData[node].track_uri,
          track_name: graphData[node].track_name,
          node_id: node,
          query_key: Key,
          color: topicColor(graphData[node].topic_id),
        }
      }
    });

    const linksNew = links.map((link: any) => {
      return {
        source: link[0],
        target: link[1],
      }
    });

    setGraphData({nodes: nodesNew, links: linksNew});

    // create wordcloud data
    console.log("Creating wordcloud data");
    const joinedLyrics = nodesNew.map((node: { data: { Lyrics: any; }; }) => node.data.Lyrics).join(' ');
    const freqMap = wordFreq(joinedLyrics);

    const wordCloudData = Object.keys(freqMap).map((key) => {
      return {
        text: key,
        value: freqMap[key],
      }
    });

    setWordCloudData(wordCloudData);
  };

  // function to handle search change
  const handleSearchChange = (event: { target: { value: SetStateAction<string>; }; }) => {
    setDetailSongData([]);
    setGraphData({ nodes: [], links: [] });
    setWordCloudData([]);
    setSearchTerm(event.target.value);
  };

  // function to handle search button click
  const handleSearchButtonClick = () => {
    searchLyrics(searchTerm, topKSearch);
  };

  // function to handle card click
  const handleCardClick = (songData: object, key: string) => {
    setDetailSongData([songData]);
    graphRetrieval(key, topKGraph, sizeGraph, treshold);
  };

  // function to get key from carousal index
  const getKeyFromCarousalIndex = (index: number) => {
    const key = searchResultKeys[index];
    const songData = searchResults[key];
    setDetailSongData([songData]);
    graphRetrieval(key, topKGraph, sizeGraph, treshold);
  };


  // function that gets width and height of the graph container
  // and returns the width and height of the graph
  const getGraphSize = () => {
    let graphContainer = document.getElementById('graph-container');
    if (graphContainer) {
      let width = graphContainer.offsetWidth;
      let height = graphContainer.offsetHeight;

      if (width === canasWidth && height === canvasHeight) {
        return { width, height };
      }

      if (canasWidth !== 0 && canvasHeight !== 0) {
        return { width: canasWidth, height: canvasHeight };
      }

      setCanvasWidth(width);
      setCanvasHeight(height);

      return { width, height };
    }
    return { width: 500, height: 500 };
  }

  // function to handle top k search change
  const handleTopKSearchChange = (event: { target: { value: SetStateAction<number>; }; }) => {
    setTopKSearch(event.target.value);
  }

  // function to handle top k graph change
  const handleTopKGraphChange = (event: { target: { value: SetStateAction<number>; }; }) => {
    setTopKGraph(event.target.value);
  }

  // function to handle size graph change
  const handleSizeGraphChange = (event: { target: { value: SetStateAction<number>; }; }) => {
    setSizeGraph(event.target.value);
  }

  // function to handle treshold change
  const handleTresholdChange = (event: { target: { value: SetStateAction<number>; }; }) => {
    setTreshold(event.target.value);
  }

  // function that opens the song on spotify website
  const openSongOnSpotify = (track_uri: string) => {
    const track_id = track_uri.split(':')[2];
    const url = 'https://open.spotify.com/track/';
    window.open(url + track_id, '_blank');
  }

  // return the page
  return (
    <ThemeProvider theme={theme}>
    <div 
      style={{ 
        padding: '20px',
        minWidth: '80%',
        minHeight: '80%',
      }}
    >
      <Grid 
        container spacing={1} 
        justifyContent="center" 
        alignContent={"center"}
        textAlign={"center"}
      >
        <Grid item xs={12} sm={12} md={12} lg={12} xl={12} 
          className="search-container"
        >
          <Paper
            sx={{
              padding: '10px',
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              flexDirection: 'row',
              backgroundColor: '#363030',
            
            }}
          >
            <Grid item xs={6} sm={6} md={6} lg={6} xl={6}
              sx={{
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
              }}
            >
              <TextField
                label="Search Lyrics"
                color='secondary'
                value={searchTerm}
                variant='filled'
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleSearchButtonClick();
                  }
                }}
                onChange={handleSearchChange}
                sx={{
                  width: '80%',
                  backgroundColor: '#ffffff',
                }}
              />
              <IconButton
                color="secondary"
                aria-label="search"
                onClick={handleSearchButtonClick}
                sx={{
                  backgroundColor: '#ffffff',
                  marginLeft: '10px',
                }}
              >
                <SearchIcon />
              </IconButton>
            </Grid>
            <Grid item xs={6} sm={6} md={6} lg={6} xl={6}
              sx={{
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
              }}
            >
              <Tooltip title="Set the parameters for the search and graph. 
                              This will influence the search results and the graph">
                <IconButton 
                  color="secondary"
                  aria-label="info"
                  sx={{
                    backgroundColor: '#ffffff',
                  }}
                >
                  <InfoIcon />
                </IconButton>
              </Tooltip>
              <Tooltip title="Top K Songs to display as search results">
                <TextField
                  label="Top K Songs"
                  color='secondary'
                  value={topKSearch}
                  variant='filled'
                  onChange={handleTopKSearchChange}
                  sx={{
                    backgroundColor: '#ffffff',
                    width: '20%',
                    marginLeft: '10px',
                  }}
                />
              </Tooltip>
              <Tooltip title="Influences the number of Top K songs used in building the graph">
                <TextField
                  label="Top K Graph"
                  color='secondary'
                  value={topKGraph}
                  variant='filled'
                  onChange={handleTopKGraphChange}
                  sx={{
                    backgroundColor: '#ffffff',
                    width: '20%',
                    marginLeft: '10px',
                  }}
                />
              </Tooltip>
              <Tooltip title="Tries to build a graph with the given size 
                              (Number of iterations to search and add nodes)">
                <TextField
                  label="Target Size Graph"
                  color='secondary'
                  value={sizeGraph}
                  variant='filled'
                  onChange={handleSizeGraphChange}
                  sx={{
                    backgroundColor: '#ffffff',
                    width: '20%',
                    marginLeft: '10px',
                  }}
                />
              </Tooltip>
              <Tooltip title="Score Treshold for the graph, can be used to control the number of edges and nodes">
                <TextField
                  label="Edge Treshold"
                  color='secondary'
                  value={treshold}
                  variant='filled'
                  onChange={handleTresholdChange}
                  sx={{
                    backgroundColor: '#ffffff',
                    width: '20%',
                    marginLeft: '10px',
                  }}
                />
              </Tooltip>
            </Grid>
          </Paper>
          <Grid 
            container 
            spacing={0} 
            justifyContent="center" 
            alignContent={"center"}
            textAlign={"center"}
            sx={{
              marginTop: '10px',
            }}
          >
            <Grid item xs={6} sm={6} md={6} lg={6} xl={6}
              sx={{
                backgroundColor: '#13201A',
                borderRight: '10px solid #181818',
              }}
            >
              <Grid container spacing={1} sx={{ width: "100%"}}>
                <Grid item xs={12} sm={12} md={12} lg={12} xl={12}
                  sx={{
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'center',
                    flexDirection: 'column',
                    height: '80vh',
                    width: '100%',
                  }}
                > 
                  <div 
                    style={{ 
                      height: '80vh',
                      width: '100%',
                      display: 'flex',
                      flexDirection: 'column',
                      backgroundColor: '#13201A',
                      flex: 1,
                      border: '1px solid #13201A',
                      borderRadius: '5px',

                    }}
                  >
                    {
                      searchResultKeys.length > 0 && detailSongData.length > 0 ? (
                        <div>
                          <Grid container spacing={1}>
                            <Grid item xs={12} sm={12} md={12} lg={12} xl={12} id="graph-container"
                              sx={{
                                height: "80vh"
                              }}
                            >
                              <Typography variant="p" component="div">
                                Graph of Songs (Colors represent different topics/clusters)
                              </Typography>
                              <ForceGraph2D
                                graphData={graphData}
                                minZoom={5}
                                width={getGraphSize().width - 8}
                                height={getGraphSize().height}
                                onNodeClick={(node) => {
                                  // use track uri to open the song on spotify website in new tab
                                  openSongOnSpotify(node.data.track_uri);
                                }}
                                nodeLabel={
                                  (node) => {
                                    return (
                                      `<div style="background-color: rgba(0, 0, 0, 0.8); color: white; padding: 5px; border-radius: 5px;">
                                        <h3>${node.data.track_name}</h3>
                                        <p>Artist: ${node.data.artist_name}</p>
                                        <p>Topic ID: ${node.data.topic_id}</p>
                                        <p>${JSON.parse(node.data.topic_words.replace(/'/g, '"')).join(', ')}</p>
                                      </div>`
                                    )
                                  }
                                }
                                nodeRelSize={5}
                                linkColor={(link) => 'rgba(255, 255, 255, 0.2)'}
                                linkDirectionalParticles={0}
                                nodeCanvasObject={(node, ctx, globalScale) => {
                                  const label = node.data.track_name
                                  const artist = node.data.artist_name
                                  const fontSize = 12/globalScale;
                                  const circleRadius = 5;

                                  ctx.beginPath();
                                  ctx.arc(node.x, node.y, circleRadius, 0, 2 * Math.PI, false);
                                  ctx.fillStyle = node.data.color;

                                  // opacity
                                  ctx.globalAlpha = 0.8;

                                  ctx.fill();

                                  ctx.font = `${fontSize}px Arial`;
                                  ctx.textAlign = 'center';
                                  ctx.textBaseline = 'middle';
                                  ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
                                  ctx.fillText(label, node.x, node.y - 2);

                                  ctx.font = `${fontSize}px Arial`;
                                  ctx.textAlign = 'center';
                                  ctx.textBaseline = 'middle';
                                  ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
                                  ctx.fillText(artist, node.x, node.y + 1);
                                }
                              }
                              />
                            </Grid>
                          </Grid>
                        </div>
                      ) : (
                        <Typography variant="h5" component="div">
                          No song selected
                        </Typography>
                      )
                    }
                  </div>
                </Grid>
              </Grid>
            </Grid>
            <Grid item xs={6} sm={6} md={6} lg={6} xl={6}
              sx={{
                height: "100%",
                width: "100%",
                backgroundColor: '#13201A',
              }}
            >
                <Carousel autoPlay={false} animation={"slide"} indicators={true}
                  onChange={(index) => getKeyFromCarousalIndex(index)}
                >
                  {searchResultKeys.length > 0 && searchResultKeys.map((key) => {
                    let itemData = searchResults[key] || { payload: {}, score: 0 };
                    let payload = itemData.payload;
                    let score = itemData.score;
                    let topicWords = JSON.parse(payload.topic_words.replace(/'/g, '"'));
                    return (
                        <Card
                          key={key}
                          sx={{
                            backgroundColor: '#363030',
                            color: '#ffffff',
                            minHeight: '200px',
                          }}
                        >
                          <CardActionArea onClick={() => handleCardClick(searchResults[key], key)}>
                            <CardContent
                              sx={{
                                minHeight: '200px',
                              }}
                            >
                              <Grid container spacing={1}>
                                <Grid item xs={1} sm={1} md={1} lg={1} xl={1}
                                  sx={{
                                    display: 'flex',
                                    justifyContent: 'left',
                                    textAlign: 'left',
                                  }}
                                >
                                  <MusicNoteIcon 
                                    sx={{ 
                                      fontSize: 50,
                                      color: colorScale(score),
                                    }} 
                                  />
                                </Grid>
                                <Grid item xs={5} sm={5} md={5} lg={5} xl={5}
                                  textAlign={"left"}
                                >
                                  <Typography variant="h5" component="div">
                                    "{payload.track_name}"
                                  </Typography>
                                  <Typography variant="subtitle1" component="div">
                                    Artists: {payload.artist_name}
                                  </Typography>
                                </Grid>
                                <Grid item xs={6} sm={6} md={6} lg={6} xl={6}
                                  textAlign={"left"}
                                >
                                  <Typography variant="h6" component="div">
                                    Topics Cluster ID: {payload.topic_id}
                                  </Typography>
                                  <br />
                                  <Typography variant="subtitle1" component="div">
                                    Most Common Words in Topic:
                                  </Typography>
                                  <Typography>
                                    {topicWords.join(', ')}
                                  </Typography>
                                </Grid>
                              </Grid>
                            </CardContent>
                          </CardActionArea>
                          <CardContent sx={{
                            textAlign: 'right',
                            marginLeft: '50px',
                            marginRight: '50px',
                          }}>
                            <Tooltip title="Open Graph">
                              <IconButton
                                color="secondary"
                                aria-label="graph"
                                onClick={() => handleCardClick(searchResults[key], key)}
                                sx={{
                                  backgroundColor: '#ffffff',
                                  marginTop: '10px',
                                }}
                              >
                                <ScatterPlotIcon />
                              </IconButton>
                            </Tooltip>
                            <Tooltip title="Open on Spotify">
                              <IconButton
                                color="secondary"
                                aria-label="play"
                                onClick={() => openSongOnSpotify(payload.track_uri)}
                                sx={{
                                  backgroundColor: '#ffffff',
                                  marginTop: '10px',
                                  marginLeft: '10px',
                                }}
                              >
                                <LibraryMusicIcon />
                              </IconButton>
                            </Tooltip>
                          </CardContent>
                        </Card>
                    )
                  })}
                </Carousel>
                <hr />
                <br />
                <Typography variant="h6" component="div">
                  Most used and common words in the graph:
                </Typography>
                <div>
                  {
                    wordCloudData.length > 0 && graphData.nodes.length > 0 ? (
                    <Wordcloud
                      words={wordCloudData}
                      width={canasWidth}
                      height={canvasHeight / 2}
                      fontSize={fontSizeSetter}
                      font={'Impact'}
                      padding={2}
                      spiral={'rectangular'}
                      rotate={0}
                      random={fixedValueGenerator}
                    >
                      {(words) => words.map((word, i) => (
                        <text
                          key={word.text}
                          fill={wordColors[i % wordColors.length]}
                          textAnchor='middle'
                          transform={`translate(${word.x}, ${word.y}) rotate(${word.rotate})`}
                          fontSize={word.size}
                          fontFamily={word.font}
                        >
                          {word.text}
                        </text>
                      ))}  
                    </Wordcloud>
                    ) : (
                      <Typography variant="h5" component="div">
                        No song selected
                      </Typography>
                    )
                  }
                </div>
            </Grid>
          </Grid>
        </Grid>
      </Grid>
    </div>
    </ThemeProvider>
  );
}
