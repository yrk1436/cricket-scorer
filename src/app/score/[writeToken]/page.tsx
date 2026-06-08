import ScorerWorkbench from "@/components/ScorerWorkbench";

import { EDIT_COOKIE_NAME } from "@/lib/edit-unlock";


import {


  


  fetchBundle,
  getMatchByWriteToken,

  needsPinForWrites,

} from "@/lib/match-service";
import { getRequestOrigin } from "@/lib/site-origin";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";

function decodeMaybe(s: string) {
  try {


    return decodeURIComponent(s);



  }



  catch {



    return s;



  }



}





export default async function ScorePage({




  

  params,



  


}: {


  


  params: Promise<{ writeToken: string }>;

}) {



  


  const raw = (await params).writeToken;

  const writeToken = decodeMaybe(raw);



  


  const m = await getMatchByWriteToken(writeToken);

  if (!m) notFound();



  


  const bundle = await fetchBundle(m);



  


  const cookie = (await cookies()).get(EDIT_COOKIE_NAME)?.value;



  


  

  const initiallyLocked = needsPinForWrites(bundle.match, cookie);



  

  const origin = await getRequestOrigin();



  


  return (


    
    <main className="min-h-screen">


      
      <ScorerWorkbench



        
        
        writeToken={writeToken}


        
        
        initial={bundle}




        
        
        initiallyLocked={initiallyLocked}


        
        
        origin={origin}




      

      />

    </main>
  );


}

