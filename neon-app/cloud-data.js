(() => {
  const ADMIN_ONLY = new Set(['schools','admin_invites','audit_logs']);
  const CORE = ['classes','class_members','activities','submissions','announcements','profiles','system_settings','interventions','attendance','teacher_attempt_reviews','teacher_attempt_answers','teacher_item_analysis','teacher_competency_performance','competencies','access_roles','access_assignment_directory','access_request_queue','access_monitoring'];
  const ASSESSMENTS = ['student_exams','student_questions','student_question_choices'];
  const orderBy = {activities:'created_at',submissions:'submitted_at',announcements:'created_at',audit_logs:'created_at',interventions:'created_at'};

  async function fetchTable(client,name,{page=0,pageSize=null}={}) {
    let query=client.from(name).select('*');
    if(orderBy[name])query=query.order(orderBy[name],{ascending:false});
    if(pageSize)query=query.range(page*pageSize,(page+1)*pageSize-1);
    const {data,error}=await query;
    if(error){
      // Feature views are deployed independently from the core application. A
      // temporarily stale Neon/PostgREST schema cache must not prevent users
      // from signing in or administrators from reaching Access Management.
      if(error.code==='PGRST205'||error.code==='42P01'){
        window.KLASEPH_MONITOR?.capture('database_optional',error,{table:name,operation:'select'});
        return [];
      }
      window.KLASEPH_MONITOR?.capture('database',error,{table:name,operation:'select'});
      throw error;
    }
    return data||[];
  }

  async function fetchTables(client,names,options={}) {
    const entries=await Promise.all(names.map(async name=>[name,await fetchTable(client,name,
      name==='profiles'&&options.isAdmin?{page:options.directoryPage||0,pageSize:options.dataSaver?25:50}:
      name==='audit_logs'?{page:options.auditPage||0,pageSize:options.dataSaver?15:25}:{} )]));
    return Object.fromEntries(entries);
  }

  async function load(client,options={}) {
    const names=[...CORE,...ASSESSMENTS,...(options.isAdmin?[...ADMIN_ONLY]:[])];
    return fetchTables(client,names,options);
  }

  window.KLASEPH_CLOUD_DATA={load,fetchTables,CORE,ASSESSMENTS};
})();
