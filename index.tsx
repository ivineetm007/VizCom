import React, { useState, useCallback, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { GoogleGenAI, Modality, Type } from '@google/genai';

// --- UI COMPONENTS (Moved outside of App to prevent re-creation on render) ---

const ImageCanvas = ({ inputImage, outputImage, isLoading, loadingMessage, triggerFileUpload }) => (
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
      ) : (
        <div className="placeholder">
            <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" className="placeholder-icon">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" x2="12" y1="3" y2="15" />
            </svg>
          <p>Click or tap to upload an image</p>
        </div>
      )}
    </div>
  );

const PromptBar = ({ prompt, setPrompt, handleSubmit, isLoading, fileInputRef, handleImageUpload }) => (
    <div className="prompt-bar">
      <label htmlFor="file-upload" className="icon-button" aria-label="Upload image">
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" x2="12" y1="3" y2="15" /></svg>
      </label>
      <input ref={fileInputRef} id="file-upload" type="file" accept="image/*" onChange={handleImageUpload} />
      <input
        type="text"
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        placeholder="design anything and make it real online"
        onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
        aria-label="Design prompt"
      />
      <button className="icon-button submit-button" onClick={handleSubmit} disabled={isLoading} aria-label="Submit prompt">
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="5" x2="19" y1="12" y2="12" /><polyline points="12 5 19 12 12 19" /></svg>
      </button>
    </div>
  );

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

  const fileToBase64 = (file: File): Promise<{ base64: string; mimeType: string }> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        const result = reader.result as string;
        const base64 = result.split(',')[1];
        resolve({ base64, mimeType: file.type });
      };
      reader.onerror = (error) => reject(error);
    });
  
  // A mock to simulate fetching a product image and converting it to base64.
  // In a real app, this would require a backend/proxy to avoid CORS issues.
  const urlToBase64 = async (url: string): Promise<{ base64: string; mimeType: string }> => {
      // Using a placeholder image to demonstrate the flow.
      const placeholderBase64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";
      return { base64: placeholderBase64, mimeType: 'image/png' };
  };

  // --- LIVE API CALLS ---
  const fetchSearchResults = async (query: string) => {
    console.log(`Fetching live search results for: "${query}"`);
    const response = await fetch('http://13.235.51.248/search', {
        method: 'POST',
        headers: {
            'accept': 'application/json',
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            q: query,
            num: 10,
        }),
    });

    if (!response.ok) {
        throw new Error(`Search API failed with status: ${response.status}`);
    }
    const data = await response.json();
    return data.shopping || [];
  };


  // --- CORE LOGIC ---
  const handleImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      try {
        const { base64, mimeType } = await fileToBase64(file);
        setInputImage({ base64, mimeType });
        setOutputImage(null); // Clear previous output
        setError(null);
      } catch (e) {
        setError('Failed to load image. Please try again.');
        console.error(e);
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
      // Step 1: Use Gemini to determine intent and get a search query
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

      // Step 2: Execute based on intent
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
        // Default to redesigning the image
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


  // --- RENDER ---
  return (
    <div className="app-container">
      <main className="main-content">
        <ImageCanvas 
            inputImage={inputImage}
            outputImage={outputImage}
            isLoading={isLoading}
            loadingMessage={loadingMessage}
            triggerFileUpload={triggerFileUpload}
        />
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
  );
};

const container = document.getElementById('root');
const root = createRoot(container!);
root.render(<App />);
