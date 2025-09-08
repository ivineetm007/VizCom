import React, { useState, useCallback, useRef, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { GoogleGenAI, Modality, Type } from '@google/genai';

// --- UI COMPONENTS (Moved outside of App to prevent re-creation on render) ---
const Header = ({ onReset }) => (
    <header className="app-header" onClick={onReset} role="button" tabIndex={0}>
        <h1>VizCom</h1>
        <p className="tagline">Visualize products in your space, instantly.</p>
    </header>
);

const WelcomeScreen = ({ handleExampleSelect }) => {
    const examplePrompts = [
        { prompt: "looking for modern leather sofa to this room", image: '/living.png', alt: 'Empty living room with white walls' },
        { prompt: "Find a black t-shirt that fits these jeans", image: '/input1-zoom.png', alt: 'Man wearing a red striped t-shirt and jeans' },
        { prompt: "Show this room with a large area rug", image: '/living.png', alt: 'Empty living room with white walls' },
        { prompt: "Try on a floral print summer dress", image: '/input2.png', alt: 'Person to try on a dress' }
    ];

    const [selectedExample, setSelectedExample] = useState(null);

    const handleUseExample = () => {
        if (selectedExample) {
            handleExampleSelect(selectedExample);
        }
    };

    return (
        <div className="welcome-screen">
            <h2 className="welcome-headline">Design Your World with Real Products.</h2>
            <p className="welcome-subheading">
                Upload a photo, choose what you want to see, and preview it instantly—every idea linked to real items you can shop.
            </p>
            <div className="inspiration">Get started with an idea:</div>
            <div className="example-prompts-grid">
                {examplePrompts.map(p => (
                    <div 
                        key={p.prompt} 
                        className={`prompt-chip ${selectedExample?.prompt === p.prompt ? 'selected' : ''}`}
                        onClick={() => setSelectedExample(p)} 
                        role="button" 
                        tabIndex={0}
                        aria-pressed={selectedExample?.prompt === p.prompt}
                    >
                        {p.prompt}
                    </div>
                ))}
            </div>

            {selectedExample && (
                <div className="example-preview">
                    <img src={selectedExample.image} alt={selectedExample.alt} className="example-preview-image" />
                    <button onClick={handleUseExample} className="use-example-button">
                        Use this Example
                    </button>
                </div>
            )}
        </div>
    );
};

const ImageCanvas = ({ activeImage, isLoading, loadingMessage, triggerFileUpload }) => {
    if (!activeImage && !isLoading) {
        return null;
    }

    return (
        <div
            className="image-canvas"
            aria-label="Image display"
        >
            {isLoading && (
                <div className="loader">
                    <div className="spinner"></div>
                    <p>{loadingMessage}</p>
                </div>
            )}
            {activeImage && (
                <img src={`data:${activeImage.mimeType};base64,${activeImage.base64}`} alt="Current design" />
            )}
        </div>
    );
};

const ImageHistory = ({ history, activeIndex, onSelect }) => {
    if (history.length <= 1) return null;

    return (
        <div className="image-history-container">
            {history.map((image, index) => (
                <img
                    key={index}
                    src={`data:${image.mimeType};base64,${image.base64}`}
                    alt={`Version ${index + 1}`}
                    className={`history-thumbnail ${index === activeIndex ? 'selected' : ''}`}
                    onClick={() => onSelect(index)}
                    role="button"
                    tabIndex={0}
                    aria-pressed={index === activeIndex}
                    aria-label={`Select version ${index + 1}`}
                />
            ))}
        </div>
    );
};


const PromptBar = ({ prompt, setPrompt, handleSubmit, isLoading, fileInputRef, handleImageUpload }) => {
    const placeholders = [
        "Find a black leather jacket for this photo...",
        "Add a minimalist coffee table to my living room...",
        "Search for a red shirt...",
        "Find a large area rug for this room..."
    ];
    const [placeholder, setPlaceholder] = useState(placeholders[0]);

    useEffect(() => {
        const interval = setInterval(() => {
            setPlaceholder(p => {
                const currentIndex = placeholders.indexOf(p);
                const nextIndex = (currentIndex + 1) % placeholders.length;
                return placeholders[nextIndex];
            });
        }, 3000);
        return () => clearInterval(interval);
    }, []);

    return (
        <div className="prompt-bar">
          <label htmlFor="file-upload" className="icon-button" aria-label="Upload image">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" x2="12" y1="3" y2="15" /></svg>
          </label>
          <input ref={fileInputRef} id="file-upload" type="file" accept="image/*" onChange={handleImageUpload} />
          <input
            type="text"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder={placeholder}
            onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
            aria-label="Design prompt"
          />
          <button className="icon-button submit-button" onClick={handleSubmit} disabled={isLoading} aria-label="Submit prompt">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="5" x2="19" y1="12" y2="12" /><polyline points="12 5 19 12 12 19" /></svg>
          </button>
        </div>
    );
};

const Sidebar = ({ searchResults, handleProductSelect }) => (
    <aside className="sidebar">
        {searchResults.length > 0 && <h2>Search Results</h2>}
      <div className="product-grid">
        {searchResults.map((product, index) => (
          <div key={product.productId || index} className="product-card" onClick={() => handleProductSelect(product)} role="button" tabIndex={0}>
            <img src={product.imageUrl} alt={product.title} />
            <div className="title">{product.title}</div>
          </div>
        ))}
      </div>
    </aside>
  );

// --- MAIN APP COMPONENT ---

type ImageObject = {
  base64: string;
  mimeType: string;
};

const App = () => {
  // --- STATE MANAGEMENT ---
  const [prompt, setPrompt] = useState('');
  const [imageHistory, setImageHistory] = useState<ImageObject[]>([]);
  const [activeImageIndex, setActiveImageIndex] = useState<number | null>(null);
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('');
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const activeImage = activeImageIndex !== null ? imageHistory[activeImageIndex] : null;

  // --- API INITIALIZATION ---
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY! });

  // --- HELPER FUNCTIONS ---
   const triggerFileUpload = () => {
    fileInputRef.current?.click();
  };
  
  const handleReset = () => {
    setPrompt('');
    setImageHistory([]);
    setActiveImageIndex(null);
    setSearchResults([]);
    setIsLoading(false);
    setLoadingMessage('');
    setError(null);
  };

  const fileToBase64 = (file: File): Promise<ImageObject> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        const base64 = result.split(",")[1]; // Remove data URL prefix
        resolve({
          base64,
          mimeType: file.type || "image/jpeg"
        });
      };
      reader.onerror = (error) => reject(error);
      reader.readAsDataURL(file);
    });
  };
    
  const urlToBase64 = async (url: string): Promise<ImageObject> => {
    try {
      return await fetchAsBase64(url);
    } catch (err) {
      console.warn("Direct fetch failed, retrying via CORS proxy...", err);
      const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`;
      return await fetchAsBase64(proxyUrl);
    }
  };

  async function fetchAsBase64(fetchUrl: string): Promise<ImageObject> {
    const response = await fetch(fetchUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch image: ${response.status} ${response.statusText}`);
    }
    const blob = await response.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result as string;
        if (!result) {
          reject(new Error("File could not be read."));
          return;
        }
        const base64 = result.split(',')[1];
        resolve({ base64, mimeType: blob.type });
      };
      reader.onerror = (error) => reject(error);
      reader.readAsDataURL(blob);
    });
  }

  const loadImageFromUrl = async (url: string): Promise<ImageObject> => {
    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Failed to fetch image: ${response.statusText}`);
        const blob = await response.blob();
        const fileName = url.split('/').pop() || 'image';
        return fileToBase64(new File([blob], fileName, { type: blob.type }));
    } catch (e) {
        console.error("Error loading local image:", e);
        throw new Error("Could not load example image.");
    }
  }

  // --- LIVE API CALLS ---
  const fetchSearchResults = async (query: string) => {
    console.log(`Fetching live search results for: "${query}" from Serper`);
    const myHeaders = new Headers();
    myHeaders.append("X-API-KEY", "6c5ec67ca27e3abacbb41695d509c965ed17e688");
    myHeaders.append("Content-Type", "application/json");
    const raw = JSON.stringify({ "q": query, "num": 10 });
    const requestOptions = {
      method: "POST",
      headers: myHeaders,
      body: raw,
      redirect: "follow" as RequestRedirect
    };
    try {
      const response = await fetch("https://google.serper.dev/shopping", requestOptions);
      if (!response.ok) {
          const errorBody = await response.text();
          console.error("Serper API Error Body:", errorBody);
          throw new Error(`Serper API failed with status: ${response.status}`);
      }
      const data = await response.json();
      return data.shopping || [];
    } catch (error) {
      console.error("Failed to fetch search results from Serper:", error);
      throw new Error("Could not retrieve search results. The Serper service may be temporarily unavailable.");
    }
  };

  // --- CORE LOGIC ---
  const handleImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      try {
        setIsLoading(true);
        setLoadingMessage("Preparing image...")
        const image = await fileToBase64(file);
        setImageHistory([image]);
        setActiveImageIndex(0);
        setError(null);
        setSearchResults([]);
      } catch (e) {
        setError('Failed to load image. Please try again.');
        console.error(e);
      } finally {
        setIsLoading(false);
      }
    }
  };
  
  const generateImage = async (
    userImage: ImageObject,
    promptText: string,
    productImage: ImageObject
  ) => {
      setLoadingMessage('Generating your new look...');
      const imageParts = [
        { inlineData: { data: userImage.base64, mimeType: userImage.mimeType } },
        { inlineData: { data: productImage.base64, mimeType: productImage.mimeType } }
      ];

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash-image-preview',
        contents: { parts: [...imageParts, { text: promptText }] },
        config: { responseModalities: [Modality.IMAGE, Modality.TEXT] },
      });

      for (const part of response.candidates![0].content.parts) {
        if (part.inlineData) {
          const newImage: ImageObject = {
              base64: part.inlineData.data,
              mimeType: part.inlineData.mimeType
          };
          setImageHistory(currentHistory => [...currentHistory, newImage]);
          setActiveImageIndex(imageHistory.length); // will be the index of the new image
          return; 
        }
      }
      throw new Error("API did not return an image. Please try again or wait for sometime. Limitation in gemini studio to fetch images");
  }

  const handleSubmit = async () => {
    if (!prompt) {
      setError('Please enter a prompt to search for a product.');
      return;
    }
    if (!activeImage) {
      setError('Please upload an image to start designing.');
      return;
    }

    setIsLoading(true);
    setError(null);
    setSearchResults([]);

    try {
      setLoadingMessage('Searching for products...');
      const products = await fetchSearchResults(prompt);
      setSearchResults(products);

      if (products.length > 0) {
        const firstProduct = products[0];
        setLoadingMessage('Applying product to image...');
        const productB64 = await urlToBase64(firstProduct.imageUrl);
        const generationPrompt = `In the user's uploaded image, replace the relevant clothing item with the provided product image (${firstProduct.title}). Ensure a realistic virtual try-on.`;
        await generateImage(activeImage, generationPrompt, productB64);
      } else {
          setError("Could not find any products matching your search.");
      }
    } catch (e: any) {
      setError(`An error occurred: ${e.message}`);
      console.error(e);
    } finally {
      setIsLoading(false);
      setLoadingMessage('');
    }
  };
  
  const handleProductSelect = useCallback(async (product: any) => {
    if (!activeImage) return;

    setIsLoading(true);
    setError(null);
    try {
        setLoadingMessage('Applying selected product...');
        const productB64 = await urlToBase64(product.imageUrl);
        const generationPrompt = `In the user's uploaded image, replace the relevant clothing item with the provided product image (${product.title}). Ensure a realistic virtual try-on.`;
        await generateImage(activeImage, generationPrompt, productB64);
    } catch (e: any) {
        setError(`Failed to apply product: ${e.message}`);
        console.error(e);
    } finally {
        setIsLoading(false);
    }
  }, [activeImage, imageHistory]);

  const handleExampleSelect = useCallback(async (example: { prompt: string; image: string }) => {
    setPrompt(example.prompt);
    if (example.image) {
        setIsLoading(true);
        setLoadingMessage("Loading example...");
        setError(null);
        setSearchResults([]);
        try {
            const imageData = await loadImageFromUrl(example.image);
            setImageHistory([imageData]);
            setActiveImageIndex(0);
        } catch (e: any) {
            setError(e.message);
            setImageHistory([]);
            setActiveImageIndex(null);
        } finally {
            setIsLoading(false);
            setLoadingMessage('');
        }
    }
  }, []);


  // --- RENDER ---
  return (
    <>
      <Header onReset={handleReset} />
      <div className={`app-container ${searchResults.length > 0 ? 'sidebar-visible' : ''}`}>
        <main className="main-content">
          {activeImage || isLoading ? (
              <>
                <ImageCanvas 
                    activeImage={activeImage}
                    isLoading={isLoading}
                    loadingMessage={loadingMessage}
                    triggerFileUpload={triggerFileUpload}
                />
                <ImageHistory 
                    history={imageHistory}
                    activeIndex={activeImageIndex}
                    onSelect={setActiveImageIndex}
                />
              </>
          ) : (
              <WelcomeScreen 
                  handleExampleSelect={handleExampleSelect}
              />
          )}
          {error && <div className="error-message">{error}</div>}
          <PromptBar
              prompt={prompt}
              setPrompt={setPrompt}
              handleSubmit={handleSubmit}
              isLoading={isLoading}
              fileInputRef={fileInputRef}
              handleImageUpload={handleImageUpload}
          />
        </main>
        <Sidebar 
          searchResults={searchResults}
          handleProductSelect={handleProductSelect}
        />
      </div>
    </>
  );
};

const container = document.getElementById('root');
const root = createRoot(container!);
root.render(<App />);
