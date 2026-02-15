class SkeletonMapper {
constructor() {
this.width = 0;
this.height = 0;
this.initialized = false;


    this.smooth = {
        pos:{x:0,y:0,z:-2},
        rot:{x:0,y:Math.PI,z:0},
        scale:2
    };
}

init(w,h){
    this.width=w;
    this.height=h;
    this.initialized=true;
}

update(poseData){
    if(!poseData?.landmarks) return;
    const jacket=modelLoader.getModel();
    if(!jacket) return;

    const L=CONFIG.SKELETON.LANDMARKS;
    const lm=poseData.landmarks;

    const LS=lm[L.LEFT_SHOULDER];
    const RS=lm[L.RIGHT_SHOULDER];
    const LH=lm[L.LEFT_HIP];
    const RH=lm[L.RIGHT_HIP];

    if(!LS||!RS||!LH||!RH) return;

    // ---- position ----
    const center={
        x:(LS.x+RS.x+LH.x+RH.x)/4,
        y:(LS.y+RS.y+LH.y+RH.y)/4,
        z:(LS.z+RS.z+LH.z+RH.z)/4
    };

    const aspect=this.width/this.height;
    const x=(center.x-0.5)*aspect*2;
    const y=-(center.y-0.5)*2;

    const shoulderDist=Math.sqrt(
        (LS.x-RS.x)**2+
        (LS.y-RS.y)**2+
        (LS.z-RS.z)**2
    );

    const z=-2.5/shoulderDist;

    // ---- rotation ----
    const dx=RS.x-LS.x;
    const dy=RS.y-LS.y;
    const dz=RS.z-LS.z;

    const yaw=Math.atan2(dz,dx);
    const roll=Math.atan2(dy,dx);

    // ---- scale ----
    const scale=Utils.clamp(1.6/shoulderDist,1.8,3.8);

    // ---- smoothing ----
    this.smooth.pos=Utils.lerp3(this.smooth.pos,{x,y,z},0.25);
    this.smooth.rot=Utils.lerp3(this.smooth.rot,{x:0,y:Math.PI-yaw,z:-roll},0.3);
    this.smooth.scale=Utils.ema(scale,this.smooth.scale,0.25);

    jacket.position.set(this.smooth.pos.x,this.smooth.pos.y,this.smooth.pos.z);
    jacket.rotation.set(this.smooth.rot.x,this.smooth.rot.y,this.smooth.rot.z);
    jacket.scale.setScalar(this.smooth.scale);
}


}

const skeletonMapper=new SkeletonMapper();