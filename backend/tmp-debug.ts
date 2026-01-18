import { AiService } from './src/ai/ai.service';
process.env.OPENAI_API_KEY='test';
const buildPayload=(text:string,conversation?:any[],requestId='req')=>({
  userText:text,
  baseLanguage:'ja',
  baseTimezone:'Asia/Tokyo',
  locale:'ja',
  timezone:'Asia/Tokyo',
  uiMode:'normal',
  turnCount:1,
  conversationId:'conv-debug',
  requestId,
  conversation,
});
const buildDefaultInitialParse=(language:'ja'|'zh'|'en')=>({intent:'EVENT_INFO',slots:{},missing:['title','time','location','price','details'],confidence:{},language,firstReplyKey:'ASK_TITLE'});
class FakeOpenAI {
  constructor(private handlers:any){}
  chat={
    completions:{
      create: async (params:any)=>{
        const schema=params?.response_format?.json_schema?.name;
        const raw=params?.messages?.[1]?.content??'{}';
        let payload:any={}; let user='';
        try{payload=JSON.parse(raw);user=payload.userText||payload.rawUserText||payload.latestUserMessage||payload?.conversation?.slice?.(-1)?.[0]?.content||'';}catch{}
        let content:any={};
        const isRouter=schema==='assistant_router';
        const isInit=schema==='initial_event_parse'||('userText'in payload && !isRouter);
        const isNorm=schema==='EventAssistantSlotNormalizer'||'rawUserText'in payload;
        const isMain=typeof payload?.phase==='string';
        if(isRouter){content=this.handlers.router?.(user)||{route:'EVENT_INFO',confidence:0.9,language:'zh'};}
        else if(isInit){content=this.handlers.initialParse?.(user)||buildDefaultInitialParse('zh');}
        else if(isNorm){content=this.handlers.normalizer?.()||{intent:'answer',updates:{},ambiguities:[],shouldCloseSlot:false};}
        else if(schema==='TitleSuggestions'){content=this.handlers.titleSuggestions?.()||{titles:['タイトル案A']};}
        else if(isMain){content=this.handlers.main?.()||{stage:'coach',status:'collecting',language:'ja',inputMode:'fill',ui:{question:{key:'title',text:'タイトルを教えてください'}},optionTexts:[],thinkingSteps:[],coachPrompt:'',writerSummary:''};}
        return {choices:[{message:{content:JSON.stringify(content)}}]};
      }
    }
  }
}

(async()=>{
  const service=new AiService(new FakeOpenAI({router:()=>({route:'EVENT_INFO',confidence:0.9,language:'zh'}),initialParse:()=>buildDefaultInitialParse('zh')}));
  const convo=[{role:'assistant' as const, content:'イベントのタイトルを教えてください。 [ask:title]'}];
  const reply=await service.generateAssistantReply(buildPayload('标题是：周末一起去happy',convo) as any, undefined as any);
  console.log('slots',reply.slots,'next',reply.nextQuestionKey);
})();
