/*
 * Click nbfs://nbhost/SystemFileSystem/Templates/Licenses/license-default.txt to change this license
 * Click nbfs://nbhost/SystemFileSystem/Templates/Classes/Class.java to edit this template
 */
package com.claytablet.relational;

import com.claytablet.tological.Adat;
import com.claytablet.tological.AdatAttributeRelationships;
import com.claytablet.tological.AdatRelationships;
import com.claytablet.tological.MultiLevelAdat;
import com.google.common.collect.Multimap;
import java.util.Collection;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Map.Entry;
import java.util.stream.Collectors;

/**
 *
 * @author dpkap
 */
public class ATR_Mixed extends adatToRelations{
    HashMap<Adat, Integer> Adatpriority = new HashMap<>() ;
    String output = "\n";

    public ATR_Mixed(Adat A) {
        super(A);
    }
    
    
    public String createMixed(HashMap<Adat, String> mixedlist, MultiLevelAdat mla , AdatAttributeRelationships [] analysis_property, AdatRelationships [] arArray){     
        int priority = -1;
        Multimap<Adat, Adat> tree = mla.getAdatcomplex(); 
        for (Map.Entry<Adat, String> entry : mixedlist.entrySet()){
            if(entry.getValue().contains("complex")){                
                Collection<Adat> children = tree.get(entry.getKey());
                ++priority;
                if(Adatpriority.containsKey(entry.getKey())){
                    int localPriority = Adatpriority.get(entry.getKey());
                    // Adatpriority.replace(entry.getKey(), localPriority, localPriority+1);
                    for(Map.Entry<Adat, Integer> e : Adatpriority.entrySet()){
                       if( e.getValue()==localPriority+1 || e.getValue()==localPriority)
                            Adatpriority.replace(e.getKey(), e.getValue(), e.getValue()+1);
                    }
                    priority = localPriority-1;
                }
                for(Adat i:children){
                    Adatpriority.put(i, priority );
                }
                Adatpriority.put(entry.getKey(),  ++priority);                
            }
        }
        HashMap <Adat, Integer> sortedAdatpriority = Adatpriority.entrySet().stream()
                .sorted(Entry.comparingByValue())
                .collect(Collectors.toMap(Entry::getKey, Entry::getValue,
                        (e1,e2)->e1, LinkedHashMap::new));
        
        for(Map.Entry<Adat, Integer> me : sortedAdatpriority.entrySet()){
            Adat a = me.getKey();            
            
            String linkType = mixedlist.get(a);
            if (linkType == null) {
                if (mla.getAdatderived() != null && mla.getAdatderived().containsKey(a)) {
                    linkType = "derived";
                } else if (mla.getAdatcontainment() != null && mla.getAdatcontainment().containsKey(a)) {
                    linkType = "containment";
                } else if (mla.getAdattree() != null && mla.getAdattree().containsKey(a)) {
                    linkType = "specialization";
                } else if (mla.getAdatcomplex() != null && mla.getAdatcomplex().containsKey(a)) {
                    linkType = "complex2";
                } else {
                    linkType = "atomic";
                }
            }

            switch (linkType){
                case "atomic": 
                {   adatToRelations arl = new adatToRelations(a);
                    output = output + "\n"+ arl.createRelation(a) + arl.createRelationships(a,arArray)
                                        + arl.createAnalysisProperty(a,analysis_property)+ arl.createDependent(a, arArray);
                    break;
                }
                case "containment": {
                    ATR_Containment arl = new ATR_Containment(a);
                    output = output + "\n"+ arl.createForContent(mla, a, analysis_property, arArray);
                    break;
                }
                case "derived":
                case "derived1":
                case "derived2":
                {
                    ATR_Derived arl = new ATR_Derived(a);
                    output = output + "\n"+arl.createDerived(a, mla, analysis_property, arArray);
                    break;
                }
                case "complex":
                case "complex1":
                case "complex2":
                {
                    output= output+ "\n"+ createRelation(a) + "\n" + createRelationships(a,arArray) 
                            + "\n" + createAnalysisProperty(a, analysis_property)
                            +"\n" + createDependent(a, arArray); 
                    Collection<Adat> children = tree.get(a);
                    if (children != null) {
                        for (Adat i : children){ 
                            if(!tree.containsKey(i)) {                      
                                output = output + "\n" + "alter table " + a.getName() + " add "+ i.getName()+"_key\tvarchar(50) ;";
                                output = output + "\n" + "alter table " + a.getName() + " add foreign key ("+ i.getName() +  "_key) references "+ 
                                       i.getName() + "(" + i.getName() + "_key);";
                            }
                        }
                    }
                    break;
                }
            }
        }
        return output;
    }
    
}
