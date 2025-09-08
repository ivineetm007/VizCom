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

const WelcomeScreen = ({ handleExampleSelect, setPrompt }) => {
    const examplePrompts = [
        { prompt: "a black t-shirt for these jeans", image: '/input1-zoom.png', alt: 'Man wearing a red striped t-shirt and jeans' },
        { prompt: "a modern leather sofa", image: '/living.png', alt: 'Empty living room with white walls' },
        { prompt: "add a minimalist coffee table" },
        { prompt: "a floral print summer dress" }
    ];

    return (
        <div className="welcome-screen">
            <h2 className="welcome-headline">Bring Your Vision to Life.</h2>
            <p className="welcome-subheading">
                Virtually try on clothes or place new furniture in your room. Just upload a photo and tell our AI what you want to see.
            </p>
            <div className="inspiration">Get started with an idea:</div>
            <div className="example-prompts-grid">
                {examplePrompts.map(p => (
                   p.image ? (
                        <div key={p.prompt} className="example-card" onClick={() => handleExampleSelect(p)} role="button" tabIndex={0}>
                            <img src={p.image} alt={p.alt} />
                            <div className="example-card-prompt">{p.prompt}</div>
                        </div>
                   ) : (
                        <div key={p.prompt} className="prompt-chip" onClick={() => setPrompt(p.prompt)}>{p.prompt}</div>
                   )
                ))}
            </div>
        </div>
    );
};

const ImageCanvas = ({ inputImage, outputImage, isLoading, loadingMessage, triggerFileUpload }) => {
    // This component is now only rendered when there IS an image or it's loading a result.
    // The placeholder logic from before is now effectively the WelcomeScreen.
    if (!inputImage && !isLoading && !outputImage) {
        return null; // Should not happen if logic in App is correct
    }

    return (
        <div
            className={`image-canvas ${!inputImage && !isLoading ? 'clickable' : ''}`}
            onClick={!inputImage && !isLoading ? triggerFileUpload : undefined}
            role={!inputImage && !isLoading ? 'button' : undefined}
            tabIndex={!inputImage && !isLoading ? 0 : -1}
            aria-label={!inputImage ? "Upload an image" : "Image display"}
            onKeyDown={(e) => {
                if ((e.key === 'Enter' || e.key === ' ') && !inputImage && !isLoading) {
                    e.preventDefault();
                    triggerFileUpload();
                }
            }}
        >
            {isLoading && (
                <div className="loader">
                    <div className="spinner"></div>
                    <p>{loadingMessage}</p>
                </div>
            )}
            {outputImage ? (
                <img src={outputImage} alt="Generated result" />
            ) : inputImage ? (
                <img src={`data:${inputImage.mimeType};base64,${inputImage.base64}`} alt="User upload" />
            ) : null}
        </div>
    );
};

const PromptBar = ({ prompt, setPrompt, handleSubmit, isLoading, fileInputRef, handleImageUpload }) => {
    const placeholders = [
        "Find a black leather jacket for this photo...",
        "Add a minimalist coffee table to my living room...",
        "What would I look like with a red shirt?",
        "Show me this room with hardwood floors"
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
    <aside className={`sidebar ${searchResults.length > 0 ? 'visible' : ''}`}>
        <h2>Search Results</h2>
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

const App = () => {
  // --- STATE MANAGEMENT ---
  const [prompt, setPrompt] = useState('');
  const [inputImage, setInputImage] = useState<{
    base64: string;
    mimeType: string;
  } | null>(null);
  const [outputImage, setOutputImage] = useState<string | null>(null);
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('');
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // --- API INITIALIZATION ---
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY! });

  // --- HELPER FUNCTIONS ---
   const triggerFileUpload = () => {
    fileInputRef.current?.click();
  };
  
  const handleReset = () => {
    setPrompt('');
    setInputImage(null);
    setOutputImage(null);
    setSearchResults([]);
    setIsLoading(false);
    setLoadingMessage('');
    setError(null);
  };

  const fileToBase64 = (file: File): Promise<{ base64: string; mimeType: string }> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        const base64 = result.split(",")[1]; // Remove data URL prefix
        resolve({
          base64,
          mimeType: file.type || "image/jpeg" // ✅ Always set MIME type
        });
      };
      reader.onerror = (error) => reject(error);
      reader.readAsDataURL(file);
    });
  };
    
  const urlToBase64 = async (url: string): Promise<{ base64: string; mimeType: string }> => {
    try {
      // Try direct fetch first
      console.log(url);
      return await fetchAsBase64(url);
    } catch (err) {
      console.warn("Direct fetch failed, retrying via CORS proxy...", err);

      // Use a CORS proxy fallback
      const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`;
      return await fetchAsBase64(proxyUrl);
    }
  };

  async function fetchAsBase64(fetchUrl: string): Promise<{ base64: string; mimeType: string }> {
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


  const loadImageFromUrl = async (url: string): Promise<{ base64: string; mimeType: string }> => {
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

    const raw = JSON.stringify({
      "q": query,
      "num": 10
    });

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
        const { base64, mimeType } = await fileToBase64(file);
        setInputImage({ base64, mimeType });
        setOutputImage(null); // Clear previous output
        setError(null);
      } catch (e) {
        setError('Failed to load image. Please try again.');
        console.error(e);
      } finally {
        setIsLoading(false);
      }
    }
  };
  
  const generateImage = async (
    userImage: { base64: string; mimeType: string },
    promptText: string,
    productImage?: { base64: string; mimeType: string }
  ) => {
      setLoadingMessage('Generating your new look...');
      const imageParts = [
        { inlineData: { data: userImage.base64, mimeType: userImage.mimeType } },
      ];

      if (productImage) {
        imageParts.push({ inlineData: { data: productImage.base64, mimeType: productImage.mimeType } });
      }

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash-image-preview',
        contents: {
          parts: [
            ...imageParts,
            { text: promptText },
          ],
        },
        config: {
          responseModalities: [Modality.IMAGE, Modality.TEXT],
        },
      });

      for (const part of response.candidates![0].content.parts) {
        if (part.inlineData) {
          setOutputImage(`data:${part.inlineData.mimeType};base64,${part.inlineData.data}`);
          return; // Exit after finding the first image
        }
      }
      throw new Error("API did not return an image.");
  }

  const handleSubmit = async () => {
    if (!prompt && !inputImage) {
      setError('Please enter a prompt or upload an image.');
      return;
    }
    if (!inputImage) {
      setError('Please upload an image to start designing.');
      return;
    }

    setIsLoading(true);
    setError(null);
    setSearchResults([]);
    setOutputImage(null);

    try {
      setLoadingMessage('Understanding your request...');
      const intentPrompt = `Based on the user's request: "${prompt}", determine the user's intent. Respond with a JSON object with two keys: "intent" (which can be "REDESIGN_IMAGE" or "SEARCH_AND_APPLY") and "searchQuery" (a concise string for a product search, or null if not applicable). Example: for "find me a black t-shirt", respond {"intent": "SEARCH_AND_APPLY", "searchQuery": "black t-shirt"}. For "make the jeans blue", respond {"intent": "REDESIGN_IMAGE", "searchQuery": null}.`;
      
      const intentResponse = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: intentPrompt,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
                intent: { type: Type.STRING },
                searchQuery: { type: Type.STRING }
            }
          }
        },
      });
      
      const { intent, searchQuery } = JSON.parse(intentResponse.text);

      if (intent === 'SEARCH_AND_APPLY' && searchQuery) {
        setLoadingMessage('Searching for products...');
        const products = await fetchSearchResults(searchQuery);
        setSearchResults(products);

        if (products.length > 0) {
          const firstProduct = products[0];
          setLoadingMessage('Applying product to image...');
          const productB64 = await urlToBase64(firstProduct.imageUrl);
          
          const generationPrompt = `In the user's uploaded image, replace the relevant clothing item with the provided product image (${firstProduct.title}). Ensure a realistic virtual try-on.`;
          await generateImage(inputImage, generationPrompt, productB64);
        } else {
            setError("Could not find any products matching your search.");
        }
      } else {
        const generationPrompt = `Based on the user's request "${prompt}", redesign the uploaded image.`;
        await generateImage(inputImage, generationPrompt);
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
    if (!inputImage) return;

    setIsLoading(true);
    setError(null);
    try {
        setLoadingMessage('Applying selected product...');
        const productB64 = await urlToBase64(product.imageUrl);
        const generationPrompt = `In the user's uploaded image, replace the relevant clothing item with the provided product image (${product.title}). Ensure a realistic virtual try-on.`;
        await generateImage(inputImage, generationPrompt, productB64);
    } catch (e: any) {
        setError(`Failed to apply product: ${e.message}`);
        console.error(e);
    } finally {
        setIsLoading(false);
    }
  }, [inputImage]);

  const handleExampleSelect = useCallback(async (example: { prompt: string; image: string }) => {
    setPrompt(example.prompt);
    if (example.image) {
        setIsLoading(true);
        setLoadingMessage("Loading example...");
        setError(null);
        setOutputImage(null);
        setSearchResults([]);
        try {
            const imageData = await loadImageFromUrl(example.image);
            setInputImage(imageData);
        } catch (e: any) {
            setError(e.message);
            setInputImage(null);
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
      <div className="app-container">
        <main className="main-content">
          {inputImage || outputImage || isLoading ? (
              <ImageCanvas 
                  inputImage={inputImage}
                  outputImage={outputImage}
                  isLoading={isLoading}
                  loadingMessage={loadingMessage}
                  triggerFileUpload={triggerFileUpload}
              />
          ) : (
              <WelcomeScreen 
                  handleExampleSelect={handleExampleSelect}
                  setPrompt={setPrompt} 
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